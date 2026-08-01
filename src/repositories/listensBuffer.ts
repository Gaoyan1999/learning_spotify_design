import { redis } from "../redis.js";

const KEY_PREFIX = "song:listens:";
const SCAN_PATTERN = `${KEY_PREFIX}*`;
const SCAN_COUNT = 100;

const key = (songId: number) => `${KEY_PREFIX}${songId}`;

export const listensBuffer = {
  async increment(songId: number): Promise<number> {
    return redis.incr(key(songId));
  },

  async get(songId: number): Promise<number> {
    const value = await redis.get(key(songId));
    return value ? Number(value) : 0;
  },

  // Ids of every song with a buffered count right now. Uses SCAN (cursor-
  // based, non-blocking) rather than KEYS, which blocks Redis for the
  // duration of the call on a large keyspace.
  async listBufferedSongIds(): Promise<number[]> {
    const ids: number[] = [];
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        SCAN_PATTERN,
        "COUNT",
        SCAN_COUNT,
      );
      cursor = nextCursor;
      for (const k of keys) {
        const id = Number(k.slice(KEY_PREFIX.length));
        if (Number.isInteger(id)) ids.push(id);
      }
    } while (cursor !== "0");
    return ids;
  },

  // Atomically reads and clears a song's buffered count in one step, so a
  // crash between "read" and "clear" can't double-apply or drop the delta.
  async take(songId: number): Promise<number> {
    const value = await redis.getdel(key(songId));
    return value ? Number(value) : 0;
  },
};
