# Stage 1 — Relational DB only: how to observe it

Stage 1 proves one thing: a normalized Postgres schema (`users` → `artists` → `albums` → `songs`) sitting behind a plain Express read API, with no caching or popularity logic yet. Everything below is about *watching* that behavior, not just trusting it.

## 1. Bring it up

```bash
cd ~/workspace/learning/learning_spotify_design
docker compose up -d        # starts Postgres only
npm run migrate             # applies db/migrations/001_init.sql
npm run seed                # truncates + reloads sample data
npm run dev                 # API on http://localhost:3000
```

Confirm the container is actually healthy before moving on — don't just trust `up -d` returned:

```bash
docker compose ps
# STATUS column should say "Up ... (healthy)"
```

## 2. Observe through the API

Each call below should be read alongside "what row(s) in Postgres does this touch?"

```bash
# health check — process is alive, no DB touched
curl -i http://localhost:3000/health

# substring, case-insensitive match against artists.name
curl -s "http://localhost:3000/api/search?q=fred" | jq
curl -s "http://localhost:3000/api/search?q=FRED" | jq   # same result — proves ILIKE is case-insensitive

# substring match against songs.title
curl -s "http://localhost:3000/api/search?q=bleu" | jq

# missing query param — should 400, not 500 or an empty 200
curl -i "http://localhost:3000/api/search"

# no match — should 200 with empty arrays, not 404
curl -s "http://localhost:3000/api/search?q=zzz-nonexistent" | jq

# join across albums -> artists is NOT tested by this endpoint;
# this one just lists songs for an album_id
curl -s "http://localhost:3000/api/album/1/songs" | jq

# song lookup does the album JOIN — response includes album_title
curl -s "http://localhost:3000/api/song/1" | jq

# non-integer id — should 400
curl -i "http://localhost:3000/api/song/not-a-number"

# well-formed but absent id — should 404
curl -i "http://localhost:3000/api/song/9999"
```

What to look for: status codes match the cases above exactly (400 for bad input, 404 for absent-but-valid, 200 with empty arrays for "no results"). If any of these come back as 500, something in the route isn't handling the edge case — that's the kind of bug this stage is meant to surface before Redis/queues add more moving parts on top.

## 3. Observe the database directly

This is the part that's easy to skip and shouldn't be — the API is a thin layer, the actual state lives in Postgres.

```bash
docker compose exec postgres psql -U spotify -d spotify_design
```

Inside `psql`:

```sql
-- see the schema itself
\dt
\d songs

-- confirm the seed data landed where you'd expect
SELECT * FROM artists;
SELECT * FROM albums;
SELECT s.id, s.title, a.title AS album_title
FROM songs s JOIN albums a ON a.id = s.album_id;

-- check whether idx_songs_title_lower actually helps the app's search query
\d songs
EXPLAIN SELECT * FROM songs WHERE title ILIKE '%bleu%';
-- this is a Seq Scan, and it always will be, at any table size. A functional
-- B-tree index on lower(title) can only accelerate an equality match
-- (lower(title) = 'exact string') or a left-anchored prefix match
-- (lower(title) LIKE 'bleu%', and even then only with a text_pattern_ops
-- opclass this index doesn't have). It can never help a '%word%' containment
-- search — there's no way to binary-search for "contains this substring
-- anywhere." Compare:
EXPLAIN SELECT * FROM songs WHERE lower(title) = 'bleu (better with time)';
-- -> Bitmap Index Scan on idx_songs_title_lower (this is what the index is
--    actually good for)
--
-- Net effect: idx_songs_title_lower is currently dead weight for this app's
-- ILIKE-based search — it will never be chosen for /api/search, regardless
-- of table size. Real substring search needs a trigram index (pg_trgm
-- extension + GIN/GiST), which is a deliberate improvement to make later,
-- not something to build reflexively now.

-- confirm migration tracking works
SELECT * FROM schema_migrations;
```

Exit with `\q`.

## 4. Break it on purpose

Small experiments worth running, to build intuition before Stage 2 adds a hot write path:

- **Restart the API mid-request** (`Ctrl+C` on `npm run dev`, then a `curl` while it's down) — confirm you get a connection-refused error, not a hang. Shows there's no retry/queueing at this layer yet.
- **Run `npm run seed` twice in a row** — should succeed both times (it's `TRUNCATE ... RESTART IDENTITY CASCADE` first), and IDs reset to 1 each time. If you'd built songs with hardcoded IDs elsewhere, this would break them — worth noticing now.
- **Run `npm run migrate` twice in a row** — second run should print `skip (already applied): 001_init.sql` and do nothing. This is what makes it safe to run on every `npm run dev` startup later without re-applying schema changes.
- **Stop Postgres while the API is running** (`docker compose stop postgres`), then hit `/api/search?q=fred` — confirm the API returns a clean `500 {"error":"internal server error"}` rather than silently returning stale/empty data, and that `/health` still responds (the process itself survives). Then `docker compose start postgres` and confirm requests recover without restarting the API process.

  This one isn't hypothetical — it caught a real bug while this stage was being built. Express 4 doesn't catch rejected promises from `async` route handlers, and `pg.Pool` crashes the whole Node process on an unhandled `'error'` event from an idle client. Both meant "Postgres restarts" used to take the entire API process down instead of failing one request. The fix is in `src/asyncHandler.ts` (wraps every route handler so failures reach Express's error middleware in `src/server.ts` instead of becoming an unhandled rejection) plus a `pool.on("error", ...)` listener in `src/db.ts`. Worth internalizing: this class of bug is invisible until you actually kill the dependency and watch what happens — reading the code wouldn't have caught it.

## 5. What's deliberately *not* here yet

No `listens` column, no Redis, no cron, no queue. Search results are ordered alphabetically (`ORDER BY title` / `ORDER BY name` — see `src/routes/search.ts`), with no popularity/relevance ranking at all. That's the point of staging — Stage 2 introduces a naive `listens` counter and re-sorts by it, and this document is the "before" baseline to compare against once that lands (watch the alphabetical order break once popularity sorting is added).
