import "dotenv/config";
import { Redis } from "ioredis";
import { Worker, type Job } from "bullmq";
import { FLUSH_LISTENS_QUEUE, type FlushListensJobData } from "./queue.js";
import { songRepository } from "./repositories/songRepository.js";

// Workers need their own connection with maxRetriesPerRequest: null so the
// blocking commands BullMQ uses internally can retry indefinitely instead
// of giving up — this is separate from the general-purpose client in
// src/redis.ts, which the queue (producer side) reuses instead.
const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker<FlushListensJobData>(
  FLUSH_LISTENS_QUEUE,
  async (job: Job<FlushListensJobData>) => {
    const { songId, delta } = job.data;
    await songRepository.applyListensDelta(songId, delta);
  },
  {
    connection,
    concurrency: 5, // this one process can apply up to 5 songs' deltas at once
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] applied delta for song ${job.data.songId} (+${job.data.delta})`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] failed to apply delta for song ${job?.data.songId}:`, err.message);
});

console.log("[worker] started — consuming flush-listens jobs");
