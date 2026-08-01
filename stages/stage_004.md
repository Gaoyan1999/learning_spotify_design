# Stage 4 — Cron aggregation, direct write, multi-instance from the start: how to observe it

Stage 4 adds the flush that Stage 3 deliberately left out: a `node-cron`
scheduler (`src/scheduler.ts`) that, every 30 seconds, scans Redis for
`song:listens:*` keys and applies each one directly to Postgres
(`UPDATE songs SET listens = listens + $delta WHERE id = $songId`).

The important design decision here isn't the cron part — it's that the
scheduler is run as **multiple instances from the start**, not one. A real
service has more than one server, so pretending otherwise would dodge the
actual problem: if 3 identical schedulers all fire on the same 30-second
tick, only one of them should actually scan-and-write, or you risk
duplicate/racing writes. That's solved with a Redis-backed distributed lock
(`src/redisRunCoordinator.ts`), plugged into `node-cron`'s built-in
`distributed` option — not something bolted on separately.

Still **no queue, no worker process** — whichever instance wins the lock
does the scan *and* the Postgres writes itself, in one script. That's
intentional: Stage 5's motivation (why you'd want to decouple "notice work"
from "do work") only lands if you've felt what a single instance doing both
looks like first.

## 1. Bring it up

```bash
cd ~/workspace/learning/learning_spotify_design
docker compose down -v      # fresh containers — new stage, new experiment
docker compose up -d        # Postgres + Redis from clean volumes
docker compose ps           # both should say "Up ... (healthy)"
npm run migrate             # 001_init.sql + 002_add_listens.sql, schema unchanged since Stage 2
npm run seed                # fresh container has no data — reload sample songs
npm run dev                 # API on http://localhost:3000
```

Then, in **3 separate terminals**, start 3 scheduler instances:

```bash
npm run scheduler
```

```bash
npm run scheduler
```

```bash
npm run scheduler
```

Each one logs `[scheduler] started — flushing song:listens:* every 30s` on
boot. They're independent Node processes on the same machine, standing in
for 3 replicas of the same service in production.

## 2. Watch the lock decide who runs

Every 30 seconds (aligned to the wall clock, at `:00` and `:30` — see the
cron-timing discussion this stage is built on, not "30 seconds after each
process started"), all 3 terminals attempt the same tick at once. Watch
their logs:

```
[cron-lock] MacBook.local:41213 acquired lock for flush-listens:2026-08-01T12:00:00.000Z
[scheduler] flushed 0/0 song(s)
[cron-lock] MacBook.local:41213 released lock for flush-listens:2026-08-01T12:00:00.000Z
```

```
[cron-lock] MacBook.local:41287 did NOT acquire lock for flush-listens:2026-08-01T12:00:00.000Z (held elsewhere)
```

```
[cron-lock] MacBook.local:41310 did NOT acquire lock for flush-listens:2026-08-01T12:00:00.000Z (held elsewhere)
```

Exactly **one** instance should print `acquired` + `flushed` + `released`
per tick; the other two print `did NOT acquire` and do nothing further that
tick. Which instance wins is not fixed — watch a few ticks go by and you
should see different PIDs win different ticks, since the lock is a fresh
per-tick key (`flush-listens:<tick-timestamp>`), not one instance being
hardcoded as "the leader."

## 3. Play some songs and watch the flush land

```bash
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq

curl -s "http://localhost:3000/api/debug/redis-listens/3" | jq
# {"id":3,"listens":3} — still buffered in Redis, Postgres hasn't moved yet
```

```bash
docker compose exec postgres psql -U spotify -d spotify_design -c \
  "SELECT id, title, listens FROM songs WHERE id = 3;"
# listens is still 0 (or whatever it was before this section) — pre-flush
```

Wait up to 30 seconds for the next tick, then check both again:

```bash
curl -s "http://localhost:3000/api/debug/redis-listens/3" | jq
# {"id":3,"listens":0} — take() used GETDEL, so the buffer was cleared
# the instant the winning scheduler read it

docker compose exec postgres psql -U spotify -d spotify_design -c \
  "SELECT id, title, listens FROM songs WHERE id = 3;"
# listens now reflects the 3 plays
```

One of the 3 scheduler terminals should show `flushed 1/1 song(s)` for that
tick; the other two should show `did NOT acquire`.

## 4. Confirm the lock in Redis directly

```bash
docker compose exec redis redis-cli
```

Time it right after hitting `/play` and just before the next `:00`/`:30`
boundary, then run:

```
KEYS cron-lock:*
```

You'll either catch the in-flight lock key (rare — the flush is fast) or,
more often, see nothing, because `onComplete` deletes it within
milliseconds of the flush finishing. If you ever *do* see a
`cron-lock:flush-listens:...` key hang around, `GET` it — the value is the
`hostname:pid` of whichever instance is holding it, which is exactly what
the log lines already told you.

## 5. Break it on purpose: kill the winner mid-run

- Pick the terminal that logged `acquired` on the most recent tick and hit
  `Ctrl+C` right after it does. The other two instances are still running.
- Hit `/play` a few more times for a different song to buffer a fresh delta.
- Wait for the next tick: a *different* instance's PID should log
  `acquired`, flush the pending delta, and release the lock — nothing was
  lost, the group just self-healed onto a surviving instance.
- Now kill **all** scheduler instances while a song still has an
  unflushed Redis buffer, confirm via the debug endpoint that the count is
  still sitting there, then start just one `npm run scheduler` back up.
  The next tick it fires still flushes that buffered delta correctly —
  proving the earlier point from planning this stage: a missed/skipped
  tick delays a flush, it doesn't lose the data, because the real state
  lives in Redis, not in any scheduler's memory.

## 6. What's deliberately *not* here yet

No queue, no worker — the instance that wins the lock still does the
`SCAN` *and* every `UPDATE` itself, sequentially, inside one script. That's
fine at this project's scale (a handful of songs), but doesn't scale to a
catalog where hundreds of thousands of distinct songs get played between
ticks — that one instance would be stuck writing rows one at a time while
the other two sit idle, unable to help. Stage 5 splits "notice work" (scan
+ enqueue, stays fast regardless of catalog size) from "do work" (the
writes, which a pool of workers can process in parallel) using BullMQ,
while keeping this same lock so the scheduler itself still doesn't
triple-scan on every tick.
