import { pool } from "../db.js";
import type { ArtistEntity } from "../entities/artist.js";
import { artistSql } from "../sql.js";

export interface ArtistSummary {
  id: number;
  name: string;
}

const toArtistSummary = (artist: ArtistEntity): ArtistSummary => ({
  id: artist.id,
  name: artist.name,
});

export const artistRepository = {
  async searchByName(query: string, limit = 20): Promise<ArtistSummary[]> {
    const { rows } = await pool.query<ArtistEntity>(artistSql.searchByName, [
      `%${query}%`,
      limit,
    ]);
    return rows.map(toArtistSummary);
  },
};
