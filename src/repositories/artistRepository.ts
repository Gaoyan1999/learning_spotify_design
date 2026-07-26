import { pool } from "../db.js";

export interface ArtistSummary {
  id: number;
  name: string;
}

export const artistRepository = {
  async searchByName(query: string, limit = 20): Promise<ArtistSummary[]> {
    const { rows } = await pool.query<ArtistSummary>(
      `SELECT id, name FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT $2`,
      [`%${query}%`, limit],
    );
    return rows;
  },
};
