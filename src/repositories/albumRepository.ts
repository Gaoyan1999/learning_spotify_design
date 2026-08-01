import { pool } from "../db.js";
import type { AlbumEntity } from "../entities/album.js";
import { albumSql } from "../sql.js";

export const albumRepository = {
  async findById(id: number): Promise<AlbumEntity | null> {
    const { rows } = await pool.query<AlbumEntity>(albumSql.findById, [id]);
    return rows[0] ?? null;
  },
};
