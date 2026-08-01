import { redis } from "../redis.js";

const key = (songId: number) => `song:listens:${songId}`;

export const listensBuffer = {
  async increment(songId: number): Promise<number> {
    return redis.incr(key(songId));
  },

  async get(songId: number): Promise<number> {
    const value = await redis.get(key(songId));
    return value ? Number(value) : 0;
  },
};
