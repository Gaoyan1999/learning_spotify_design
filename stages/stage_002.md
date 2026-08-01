# Stage 2 — Naive popularity counter: how to observe it

Stage 2 proves the naive baseline the video frames as the thing to improve
on: every play is a direct Postgres write (`UPDATE songs SET listens =
listens + 1`), no buffering. This document covers both slices — the schema
migration and the API/read-path wiring — plus a script that emulates real
traffic against it.

## 1. Apply the migration

```bash
cd ~/workspace/learning/learning_spotify_design
docker compose down -v      # fresh container — Stage 2 is a new experiment,
                            # not a continuation of Stage 1's data
docker compose up -d        # start Postgres from a clean volume
docker compose ps           # should say "Up ... (healthy)"
npm run migrate             # applies 001_init.sql then 002_add_listens.sql,
                            # in order, on the new volume
npm run seed                # fresh container has no data — reload sample
                            # artists/albums/songs
```

Expected `migrate` output: `applying: 001_init.sql`, `applying:
002_add_listens.sql`, then `migrations up to date`. Run it a second time to
confirm idempotency — should print `skip (already applied): ...` for both
files.

## 2. Observe the schema change

```bash
docker compose exec postgres psql -U spotify -d spotify_design
```

Inside `psql`:

```sql
\d songs
-- listens should now appear: "listens | integer | not null default 0"

SELECT id, title, listens FROM songs;
-- every existing row backfilled to 0 — ADD COLUMN ... DEFAULT applies to
-- existing rows too, not just future inserts

-- confirm the new index exists and is a plain btree on listens DESC
\di idx_songs_listens

-- the index has nothing to do yet — nothing writes to `listens` at this
-- point, and with every row at 0 there's no ordering for it to accelerate
EXPLAIN SELECT * FROM songs ORDER BY listens DESC;

SELECT * FROM schema_migrations;
-- both 001_init.sql and 002_add_listens.sql should be listed
```

Exit with `\q`.

## 3. Play a song and watch search re-order

```bash
npm run dev   # if not already running

curl -s "http://localhost:3000/api/search?q=e" | jq
# alphabetical-ish, since every song is still at listens=0 and it's now a
# secondary sort key (ORDER BY listens DESC, title)

curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
curl -s -X POST "http://localhost:3000/api/song/3/play" | jq
# each call returns {"id":3,"listens":N} — N increments by exactly 1 per call,
# proving there's no batching/dedup at this layer: it's a direct write, one
# request = one row update, every time

curl -s "http://localhost:3000/api/search?q=e" | jq
# song 3 now sorts first — search reads listens live off Postgres, no cache

curl -i -X POST "http://localhost:3000/api/song/9999/play"
# 404 — same not-found handling as GET /api/song/:id

curl -i -X POST "http://localhost:3000/api/song/not-a-number/play"
# 400 — same input validation as GET /api/song/:id
```

Confirm the write directly in `psql` too:

```sql
SELECT id, title, listens FROM songs ORDER BY listens DESC;
```

## 4. Emulate concurrent users

`automation/simulate-plays.ts` spins up several fake "users" as concurrent
async loops, each repeatedly picking a song (weighted so some songs get
played more than others — see `songWeights` in the script) and calling
`POST /api/song/:id/play`, with a random delay between plays.

```bash
npm run simulate
# NUM_USERS=20 DURATION_MS=10000 npm run simulate   # tune concurrency/duration via env vars
```

It prints a per-song count of plays it *sent*; compare that against Postgres
to confirm every request actually landed — with no buffering yet, "requests
sent" and "listens incremented" should match exactly:

```sql
SELECT id, title, listens FROM songs ORDER BY listens DESC;
```

Watching this now is the point of comparison for Stage 3: once Redis sits in
front of Postgres as a write buffer, this same script will hammer Redis
instead, and `listens` in Postgres will stay flat until a flush — a very
different picture from the 1-write-per-request behavior you're seeing here.

## 5. What's deliberately *not* here yet

No Redis, no cron, no queue — every `/play` call is a synchronous Postgres
`UPDATE`, holding open a DB connection for the full round trip. At real
Spotify-scale traffic this is the exact bottleneck the video's design is
solving; Stage 3 introduces the write buffer that removes it.
