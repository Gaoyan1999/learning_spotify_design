# Spotify System-Design Lab — Staged Build Plan

## Context

We designed a Spotify-like backend architecture (relational DB + blob store, search, streaming, follow/unfollow, and a popularity-ranking pipeline built on a Redis write-buffer + cron aggregation + queue + workers) while discussing a system-design video's transcript. The user wants to actually **build** this as a hands-on learning project, backend-only (no frontend), to internalize the components — not ship a product. The request is to stage the build from a minimal working relational-DB-only slice up to the full popularity pipeline, adding one real component at a time so each stage is runnable and verifiable before the next is layered on.

**Stack decisions (confirmed with user):**
- **Language/runtime:** Node.js + TypeScript
- **Infra depth:** Real infra via Docker Compose (actual Postgres, actual Redis, actual queue) — not in-memory simulations
- **Location:** `~/workspace/learning/learning_spotify_design` (follows the existing `learning_k8s` / `learning_llm` / `learning_nodejs` naming convention already used in `~/workspace/learning/`)

**Supporting library choices** (kept deliberately minimal/boring so the DB/Redis/queue mechanics stay visible, not hidden behind an ORM):
- Web framework: **Express**
- DB access: raw **`pg`** driver + hand-written `.sql` migration files (no ORM) — maximizes SQL/schema learning
- Redis client: **`ioredis`**
- Queue: **BullMQ** (built on Redis, so no third message-broker container needed) for the popularity aggregation pipeline
- Scheduler: **`node-cron`** for the periodic flush job (kept as an explicit standalone component so the cron→queue→worker pipeline stays conceptually distinct, per the video's design)
- Dev tooling: `tsx` for TS execution/watch, `dotenv` for config

## Stage Breakdown

Each stage is independently runnable via `docker compose up` + a documented `curl` check before moving to the next. Nothing is built ahead of when it's needed.

### Stage 1 — Skeleton + relational DB only ✅ done
- Project scaffold: `package.json`, `tsconfig.json`, `src/` layout (`src/server.ts`, `src/db.ts`, `src/routes/`)
- `docker-compose.yml` with **Postgres only**
- `db/migrations/001_init.sql`: `users`, `artists`, `albums`, `songs` tables (matching the schema discussed: songs FK → albums FK → artists, `object_ref` placeholder column for the "blob store" pointer)
- A tiny migration runner script (`npm run migrate`) that applies `.sql` files in order via `pg`
- `db/seed.sql` or a `seed.ts` script with sample artists/albums/songs
- REST endpoints (Express):
  - `GET /api/search?q=` — case-insensitive substring match on song/artist titles
  - `GET /api/album/:id/songs`
  - `GET /api/song/:id`
- **No popularity/listens logic yet.** Goal is purely: DB up, schema applied, seeded, queryable via HTTP.
- **Verify:** `docker compose up -d`, `npm run migrate`, `npm run seed`, then `curl localhost:PORT/api/search?q=fred` returns seeded rows.

### Stage 2 — Naive popularity (direct DB write)
- Migration: add `listens INT DEFAULT 0` to `songs`, add index on `listens`
- `POST /api/song/:id/play` → `UPDATE songs SET listens = listens + 1 WHERE id = $1`
- `GET /api/search` now orders by `listens DESC` as a secondary sort
- Purpose: establish the naive baseline (every play = a DB write) before optimizing — mirrors the video's own framing ("here's the flaw with this").
- **Verify:** hit `/play` a few times, confirm `listens` increments and search ordering changes.

### Stage 3 — Redis as write buffer
- Add **Redis** to `docker-compose.yml`
- `POST /api/song/:id/play` now does `INCR song:listens:<id>` in Redis instead of touching Postgres
- Add a debug endpoint `GET /api/debug/redis-listens/:id` to inspect the buffered count directly
- Postgres `listens` field is now stale by design at this stage (not yet reconciled) — that's expected and sets up Stage 4
- **Verify:** hit `/play`, confirm Redis counter increments (`redis-cli GET song:listens:<id>` or the debug endpoint) while Postgres stays flat.

### Stage 4 — Cron aggregation → queue → worker (full pipeline)
- Add a **scheduler process** (`src/scheduler.ts`, `node-cron`) running on a short interval for learning purposes (e.g. every 30s instead of the video's 12h) that:
  1. Scans Redis for `song:listens:*` keys
  2. Enqueues a BullMQ job per song with `{ songId, delta }`
  3. Deletes/resets the flushed Redis keys
- Add a **worker process** (`src/worker.ts`, BullMQ worker) that consumes jobs and applies `UPDATE songs SET listens = listens + $delta WHERE id = $songId`
- Both run as separate `docker-compose` services (or separate `npm run` processes) from the API — this is the point: decoupling the hot read/write path from the popularity bookkeeping
- Search continues to read only from Postgres (confirmed earlier: no read-time merge of Redis + DB — that trade-off was explicitly rejected as unnecessary complexity)
- **Verify:** hit `/play` several times, confirm Redis counter goes up, wait for the cron interval, confirm Redis resets to 0 and Postgres `listens` reflects the flushed total; search ordering updates only after the flush.

### Stage 5 — Optional stretch (only if the earlier stages felt easy)
Flagged explicitly as optional/lower-value for a solo learning repo — not built unless requested later:
- Follow/unfollow: composite-key join table `user_follows_artist` + `POST/DELETE /api/follow/:artistId` — cheap to add, isolated from the popularity pipeline
- Pagination (`limit`/`offset`) on `/api/search`
- Sharding simulation: two Postgres schemas/DBs + app-level hash routing, to *feel* the resharding cost the video describes — acknowledged as a simulation, not real horizontal scale
- CDN/streaming: not worth building for real; at most a mocked `/api/song/:id/manifest` endpoint returning a fake DASH-style segment list, purely conceptual

## File/Directory Layout (Stage 1 baseline, grows in later stages)

```
learning_spotify_design/
  docker-compose.yml
  package.json
  tsconfig.json
  .env.example
  db/
    migrations/
      001_init.sql
      002_add_listens.sql        (Stage 2)
    seed.sql
  src/
    db.ts                        (pg pool)
    server.ts                    (Express app + routes)
    routes/
      search.ts
      songs.ts
      albums.ts
    redis.ts                     (Stage 3, ioredis client)
    scheduler.ts                 (Stage 4, node-cron flush job)
    worker.ts                    (Stage 4, BullMQ worker)
    queue.ts                     (Stage 4, BullMQ queue setup)
```

## Verification Approach

Each stage ends with a manual `curl`/`redis-cli`/`psql` check documented above — this is a learning project, so verification is "does the component behave the way the design predicts," not automated test coverage. No frontend, no CI — matches the user's stated scope.

## Next Step

Stage 1 is implemented and committed. Stop and confirm with the user before starting Stage 2, so each layer is actually understood/reviewed before the next is added (matches "don't put everything in first stage" instruction).
