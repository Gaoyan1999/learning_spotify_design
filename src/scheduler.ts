import "dotenv/config";
import cron from "node-cron";
import { redis } from "./redis.js";
import { listensBuffer } from "./repositories/listensBuffer.js";
import { songRepository } from "./repositories/songRepository.js";
import { createRedisRunCoordinator } from "./redisRunCoordinator.js";

async function flushListens(): Promise<void> {
  const songIds = await listensBuffer.listBufferedSongIds();
  let flushed = 0;

  for (const songId of songIds) {
    const delta = await listensBuffer.take(songId);
    // 0 means either nothing was buffered, or another instance's earlier
    // tick already claimed this key via take()'s GETDEL.
    if (delta <= 0) continue;

    await songRepository.applyListensDelta(songId, delta);
    flushed++;
  }

  console.log(`[scheduler] flushed ${flushed}/${songIds.length} song(s)`);
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

console.log("[scheduler] started — flushing song:listens:* every 30s");
