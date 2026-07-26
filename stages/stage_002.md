# Stage 2.1 — Add a naive `listens` counter: migration only

This is the first slice of Stage 2: just the schema change. `songs` gets a
`listens` column, written to directly by future requests (no Redis buffer
yet — that's Stage 3). No route changes in this slice; `/api/song/:id/play`
and popularity-ordered search land in later 2.x steps. This doc is only
about applying and observing `db/migrations/002_add_listens.sql`.

## 1. Apply the migration

```bash
cd ~/workspace/learning/learning_spotify_design
docker compose up -d        # make sure Postgres is running
npm run migrate             # applies 002_add_listens.sql on top of 001_init.sql
```

Expected output: `applying: 002_add_listens.sql` then `migrations up to date`.
Run it a second time to confirm idempotency — should print
`skip (already applied): 002_add_listens.sql` for both files.

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

## 3. What's deliberately *not* here yet

No `POST /api/song/:id/play` route, no change to `/api/search` ordering —
search still sorts alphabetically exactly as in Stage 1
(`stages/stage_001.md`). `listens` sits on every row at `0`, unused by the
API. That gap is intentional: the next 2.x step wires up the write path and
the read-path ordering, so the "before" state here is worth confirming now
while it's still trivially checkable.
