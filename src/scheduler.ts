import "dotenv/config";
import cron from "node-cron";
import { redis } from "./redis.js";
import { listensBuffer } from "./repositories/listensBuffer.js";
import { listensQueue } from "./queue.js";
import { createRedisRunCoordinator } from "./redisRunCoordinator.js";

async function flushListens(): Promise<void> {
  const songIds = await listensBuffer.listBufferedSongIds();
  let enqueued = 0;

  for (const songId of songIds) {
    const delta = await listensBuffer.take(songId);
    // 0 means either nothing was buffered, or another instance's earlier
    // tick already claimed this key via take()'s GETDEL.
    if (delta <= 0) continue;

    // The Redis side is already done (take() cleared it) — enqueueing is
    // the only thing left here. The actual Postgres write happens in
    // src/worker.ts, not in this process.
    await listensQueue.add(
      "flush",
      { songId, delta },
      { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    );
    enqueued++;
  }

  console.log(`[scheduler] enqueued ${enqueued}/${songIds.length} song(s)`);
}

cron.schedule(
  "*/30 * * * * *",
  async () => {
    await flushListens();
  },
  {
    name: "flush-listens",
    distributed: true,
    runCoordinator: createRedisRunCoordinator(redis),
  },
);

console.log("[scheduler] started — enqueuing song:listens:* flushes every 30s");
