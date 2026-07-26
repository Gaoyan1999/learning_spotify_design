import { pool } from "../db.js";

export interface SongSummary {
  id: number;
  title: string;
  album_id: number;
}

export interface SongDetail {
  id: number;
  title: string;
  object_ref: string;
  album_id: number;
  album_title: string;
}

export interface AlbumSong {
  id: number;
  title: string;
  object_ref: string;
}

export const songRepository = {
  async searchByTitle(query: string, limit = 20): Promise<SongSummary[]> {
    const { rows } = await pool.query<SongSummary>(
      `SELECT id, title, album_id FROM songs WHERE title ILIKE $1 ORDER BY title LIMIT $2`,
      [`%${query}%`, limit],
    );
    return rows;
  },

  async findById(id: number): Promise<SongDetail | null> {
    const { rows } = await pool.query<SongDetail>(
      `SELECT s.id, s.title, s.object_ref, s.album_id, a.title AS album_title
       FROM songs s
       JOIN albums a ON a.id = s.album_id
       WHERE s.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async listByAlbumId(albumId: number): Promise<AlbumSong[]> {
    const { rows } = await pool.query<AlbumSong>(
      `SELECT id, title, object_ref FROM songs WHERE album_id = $1 ORDER BY id`,
      [albumId],
    );
    return rows;
  },
};
