import { hostname } from "node:os";
import type { Redis } from "ioredis";
import type { RunCoordinator } from "node-cron";

// node-cron calls shouldRun(key, ttlMs) once per scheduled tick, where `key`
// already encodes the tick's own timestamp (e.g. "flush-listens:2026-08-
// 01T12:00:00.000Z"). That means every tick gets its own lock key for free —
// we don't need to hand-roll a single shared lock name or worry about
// releasing it safely, because no other tick will ever reuse this key.
const LOCK_PREFIX = "cron-lock:";

// Multiple scheduler instances on the same machine (e.g. several `npm run
// scheduler` processes during local testing) share a hostname, so PID is
// what actually tells them apart in the logs.
const instanceId = `${hostname()}:${process.pid}`;

export function createRedisRunCoordinator(redis: Redis): RunCoordinator {
  return {
    async shouldRun(key, ttlMs) {
      const acquired = await redis.set(`${LOCK_PREFIX}${key}`, instanceId, "PX", ttlMs, "NX");
      const won = acquired === "OK";
      console.log(
        won
          ? `[cron-lock] ${instanceId} acquired lock for ${key}`
          : `[cron-lock] ${instanceId} did NOT acquire lock for ${key} (held elsewhere)`,
      );
      return won;
    },

    async onComplete(key) {
      // Only the instance that won shouldRun() ever reaches here for this
      // key, so a plain DEL is safe — no compare-and-delete needed.
      await redis.del(`${LOCK_PREFIX}${key}`);
      console.log(`[cron-lock] ${instanceId} released lock for ${key}`);
    },
  };
}
