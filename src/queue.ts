import { Queue } from "bullmq";
import { redis } from "./redis.js";

export interface FlushListensJobData {
  songId: number;
  delta: number;
}

export const FLUSH_LISTENS_QUEUE = "flush-listens";

// Producers can safely share the app's existing ioredis connection (unlike
// Worker connections, which need their own — see src/worker.ts).
export const listensQueue = new Queue<FlushListensJobData>(FLUSH_LISTENS_QUEUE, {
  connection: redis,
});
