import "dotenv/config";
import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

redis.on("error", (err: Error) => {
  console.error("unexpected error on redis client", err);
});
