# Spotify System-Design Lab

A hands-on learning project that builds a Spotify-like backend piece by piece — relational DB, search, and a popularity-ranking pipeline (Redis write-buffer + cron aggregation + queue + worker) — based on a classic "design Spotify" system-design walkthrough.

Backend only, no frontend. The goal is to actually run each component and see how it behaves, not to ship a product. See [`PLAN.md`](./PLAN.md) for the full staged build plan and design rationale.

## Stack

- Node.js + TypeScript, run via [`tsx`](https://github.com/privatenumber/tsx)
- Express for the HTTP API
- Postgres via raw `pg` (no ORM — migrations are hand-written `.sql` files)
- Redis (`ioredis`) + BullMQ + `node-cron` — introduced in later stages
- Docker Compose for infra

## Progress

- [x] **Stage 1** — Postgres schema (`users`, `artists`, `albums`, `songs`) + read API (`/api/search`, `/api/album/:id/songs`, `/api/song/:id`)
- [ ] **Stage 2** — naive popularity counter, written directly to Postgres
- [ ] **Stage 3** — Redis as a write buffer for listens
- [ ] **Stage 4** — cron flush → queue → worker pipeline reconciling Redis into Postgres
- [ ] **Stage 5** — optional stretch (follow/unfollow, pagination, sharding simulation, mock CDN/streaming)

## Setup

```bash
npm install
cp .env.example .env
docker compose up -d      # starts Postgres
npm run migrate           # applies db/migrations/*.sql
npm run seed               # loads sample artists/albums/songs
npm run dev                 # starts the API on http://localhost:3000
```

## Try it

```bash
curl "http://localhost:3000/api/search?q=fred"
curl "http://localhost:3000/api/album/1/songs"
curl "http://localhost:3000/api/song/1"
```

## Project layout

```
db/migrations/   hand-written SQL migrations, applied in filename order
src/db.ts        pg connection pool
src/migrate.ts   tiny migration runner (tracks applied files in schema_migrations)
src/seed.ts      sample data loader
src/routes/      Express route handlers
src/server.ts    app entrypoint
```
