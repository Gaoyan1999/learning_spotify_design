# Stage 5 — Queue + worker (decouple scan from write): how to observe it

Stage 4 left one instance doing two jobs per tick: scanning Redis for
buffered deltas *and* writing every one of them to Postgres, sequentially,
inside the same script. Stage 5 splits those jobs apart.

The scheduler (`src/scheduler.ts`) keeps the exact same Stage 4 lock
(`createRedisRunCoordinator`) — still only one instance scans per tick, so
three schedulers don't redundantly re-scan and race on `take()`'s `GETDEL`.
What changed is what the winning instance does with what it finds: instead
of writing to Postgres itself, it calls `listensBuffer.take(songId)` (same
atomic `GETDEL` as before) and then `listensQueue.add("flush", { songId,
delta })` — a BullMQ job (`src/queue.ts`). The Redis side is fully done at
that point; the Postgres write is somebody else's problem now.

That somebody else is `src/worker.ts`, a new standalone process running a
BullMQ `Worker` with `concurrency: 5`. It consumes `flush` jobs and runs the
same `UPDATE songs SET listens = listens + $delta WHERE id = $songId` that
the scheduler used to run inline, retrying up to 3 times with exponential
backoff if a write fails.

Two Redis connections are involved on the BullMQ side, and they're not
interchangeable: the queue (producer, in `queue.ts`) reuses the app's
existing shared `ioredis` client, but the worker opens its own connection
with `maxRetriesPerRequest: null` — required because BullMQ workers issue
blocking commands while waiting for jobs, which must be able to retry
indefinitely instead of giving up.

## 1. Bring it up

```bash
cd ~/workspace/learning/learning_spotify_design
docker compose down -v      # fresh containers — new stage, new experiment
docker compose up -d        # Postgres + Redis from clean volumes
docker compose ps           # both should say "Up ... (healthy)"
npm run migrate             # schema unchanged since Stage 2
npm run seed                # fresh container has no data — reload sample songs
npm run dev                 # API on http://localhost:3000
```

Then, in 2 more terminals, start one scheduler and one worker:

```bash
npm run scheduler
```

```bash
npm run worker
```

You can still run multiple `npm run scheduler` instances here (Stage 4's
lock still applies), but a single one is enough to see Stage 5's new
behavior. The worker logs `[worker] started — consuming flush-listens jobs`
on boot.

## 2. Play some songs and watch the queue fill

```bash
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq

curl -s "http://localhost:3000/api/debug/redis-listens/3" | jq
# {"id":3,"listens":3} — still buffered in Redis, nothing enqueued yet
```

For firing more than a couple of plays at once, `automation/mock-listens.sh`
does the same `curl` loop for you:

```bash
./automation/mock-listens.sh 20        # 20 plays, no delay
./automation/mock-listens.sh 20 0.5    # same, with 0.5s between each
```

It's a plain bash/curl script (no `tsx`/Node needed), spreading plays
randomly across songs 1–3 — with roughly 1 in 10 plays deliberately aimed
at a nonexistent song id (`9999`), to exercise the API's error handling
along the way. Unlike `npm run simulate`, which models multiple weighted
users over a duration, this just fires N plays as fast (or as spaced out)
as you tell it to and reports how many succeeded vs. failed.

Wait for the next scheduler tick (up to 30s), then check the queue debug
endpoint added this stage:

```bash
curl -s "http://localhost:3000/api/debug/queue-counts" | jq
# {"waiting":0,"active":0,"completed":1,"failed":0,...} — the worker likely
# already drained it; catch it mid-flight by checking right after the tick
# fires instead, if you want to see "waiting"/"active" move
```

The scheduler's own log line changed from Stage 4's `flushed N/N song(s)`
to `enqueued N/N song(s)` — it's not writing to Postgres anymore, just
handing jobs off.

## 3. Confirm the write still lands, just one hop later

```bash
curl -s "http://localhost:3000/api/debug/redis-listens/3" | jq
# {"id":3,"listens":0} — take() cleared the buffer the instant the
# scheduler read it, same as Stage 4

docker compose exec postgres psql -U spotify -d spotify_design -c \
  "SELECT id, title, listens FROM songs WHERE id = 3;"
# listens now reflects the 3 plays — applied by the worker, not the scheduler
```

Check the worker's terminal — it should show:

```
[worker] applied delta for song 3 (+3)
```

## 4. See the two roles actually decouple

Kill the worker (`Ctrl+C` in its terminal) but leave the scheduler running.

```bash
curl -s -X POST "http://localhost:3000/api/song/5/play" | jq
curl -s -X POST "http://localhost:3000/api/song/5/play" | jq
```

Wait for the next tick — the scheduler still logs `enqueued 1/1 song(s)`
and keeps ticking normally every 30s even with no worker alive to consume
anything:

```bash
curl -s "http://localhost:3000/api/debug/queue-counts" | jq
# {"waiting":1,...} — the job is sitting in Redis, nobody's home to run it

docker compose exec postgres psql -U spotify -d spotify_design -c \
  "SELECT id, title, listens FROM songs WHERE id = 5;"
# listens hasn't moved — the write genuinely hasn't happened yet
```

Now start the worker back up (`npm run worker`). It picks up the queued job
immediately on boot and the Postgres row updates — nothing was lost while
it was down, because BullMQ persisted the job in Redis, not in the worker's
memory.

## 5. What Stage 5 actually bought you

In Stage 4, the one instance holding the lock had to scan *and* write every
row itself, one at a time — at catalog scale, a slow burst of writes would
directly delay how quickly the next tick's scan could start, because it was
all one sequential script. Now the scan+enqueue step is decoupled from the
writes: it stays cheap and constant regardless of how many songs need
updating, and the writes can be processed by `concurrency: 5` inside one
worker, or by adding more `npm run worker` processes entirely, without
touching the scheduler at all.

## 6. What's deliberately *not* here yet

Only one worker process was run in this walkthrough, even though nothing
stops you from starting a second `npm run worker` alongside it — BullMQ
guarantees each job goes to exactly one worker, so this is a legitimate,
free way to add more write throughput if you want to try it. That's the
natural next thing to poke at, not a new component: Stage 5 completes the
pipeline the original design called for (write buffer → cron scan → queue →
worker), and the plan flags what's left (follow/unfollow, pagination,
sharding, mock CDN) as optional stretch, not required to consider this
project's core loop finished.
