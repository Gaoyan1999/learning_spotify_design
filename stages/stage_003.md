# Stage 3 — Redis as a write buffer: how to observe it

Stage 3 removes Postgres from the hot write path. `POST /api/song/:id/play`
no longer touches Postgres at all — it does `INCR song:listens:<id>`
against Redis. Postgres's `listens` column is now **frozen**: the seed sets
every row to 0, and that's what it'll keep holding until Stage 4 adds a
flush. That staleness is the entire point of this stage, not a bug in it.

## 1. Bring it up

```bash
cd ~/workspace/learning/learning_spotify_design
npm install                 # pulls in ioredis
docker compose down -v      # fresh containers — Stage 3 is a new experiment,
                            # not a continuation of Stage 2's data
docker compose up -d        # now starts Postgres AND Redis, both from clean volumes
docker compose ps           # both should say "Up ... (healthy)"
npm run migrate             # applies 001_init.sql + 002_add_listens.sql on the
                            # new Postgres volume — no new migration file in this
                            # stage, the schema itself is unchanged from Stage 2
npm run seed                # fresh container has no data — reload sample
                            # artists/albums/songs
npm run dev                 # API on http://localhost:3000
```

## 2. Observe through the API

```bash
# baseline: fresh seed, every song's listens=0, alphabetical-ish ordering
curl -s "http://localhost:3000/api/search?q=e" | jq

curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
# {"id":3,"listens":N} — but N is now the *Redis buffer count*, starting
# from 0 the first time a song is played in this stage. It is NOT the same
# number as the "listens" field Stage 2 returned (that was the running
# Postgres total). Same field name, different meaning — worth noticing.

curl -s "http://localhost:3000/api/search?q=e" | jq
# unchanged from before you called /play — search still reads Postgres
# only, and Postgres hasn't moved. This is the "stale by design" behavior:
# there is deliberately no read-time merge of Redis + Postgres.

# the new debug endpoint reads the Redis buffer directly
curl -s "http://localhost:3000/api/debug/redis-listens/3" | jq
# {"id":3,"listens":3} — matches the /play call count above exactly

curl -s "http://localhost:3000/api/debug/redis-listens/9999" | jq
# {"id":9999,"listens":0} — no key yet means 0, not a 404

curl -i "http://localhost:3000/api/debug/redis-listens/not-a-number"
# 400 — same input validation as the other :id routes
```

**Behavior that changed from Stage 2, on purpose:** `POST /api/song/9999/play`
now returns `200 {"id":9999,"listens":1}` instead of `404`. Removing
Postgres from this path means there's no synchronous existence check left
to do the 404-ing — Redis will happily `INCR` a key for any integer id you
throw at it. That's a real, deliberate limitation of naive write-buffering:
garbage ids accumulate as harmless Redis keys instead of being rejected.
Stage 4's flush is what has to cope with this (`UPDATE ... WHERE id =
$songId` on a nonexistent id just affects 0 rows and the buffered count is
silently dropped) — nothing here validates it early.

## 3. Observe Redis directly

```bash
docker compose exec redis redis-cli
```

Inside `redis-cli`:

```
KEYS song:listens:*
# one key per song that's been played since Redis last started

GET song:listens:3
# raw string value, e.g. "3" — INCR stores integers as strings internally

TTL song:listens:3
# -1: no expiry set, these keys live forever until Stage 4 deletes them
# on flush
```

Exit with `exit` or Ctrl+D.

Cross-check against Postgres to see the staleness directly:

```bash
docker compose exec postgres psql -U spotify -d spotify_design -c \
  "SELECT id, title, listens FROM songs ORDER BY id;"
```

`listens` here should stay at the seeded 0 for every row, no matter how many
times you've hit `/play` in this stage.

## 4. Emulate concurrent users

```bash
npm run simulate
```

Same script as Stage 2 — it just calls `POST /api/song/:id/play` — but the
effect on the two stores is now completely different. Compare:

```bash
# what the script says it sent
# ("plays sent per song" in its own stdout)

# what Redis actually has buffered
docker compose exec redis redis-cli MGET song:listens:1 song:listens:2 song:listens:3

# what Postgres has (should be flat/unchanged)
docker compose exec postgres psql -U spotify -d spotify_design -c \
  "SELECT id, listens FROM songs ORDER BY id;"
```

The Redis numbers should match "plays sent" per song exactly — one `INCR`
per request, no batching yet either, just a different store than Stage 2
was writing to. Postgres stays flat throughout the entire run. This is the
comparison the Stage 2 doc set up: same script, same request pattern,
completely different backing-store behavior.

## 5. What's deliberately *not* here yet

No cron, no queue, no worker — nothing ever reads the Redis buffer back out
and applies it to Postgres. `listens` in Postgres is now permanently stale
until Stage 4 adds the flush pipeline (scan `song:listens:*` → enqueue a
job per song → worker applies the delta → delete the flushed key). Search
also still only reads Postgres, unchanged — that trade-off (no read-time
merge of the buffer into search results) was decided back in `PLAN.md` and
isn't revisited here.
