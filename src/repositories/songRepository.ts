import { pool } from "../db.js";
import type { SongEntity } from "../entities/song.js";
import { songSql } from "../sql.js";
import { albumRepository } from "./albumRepository.js";

export interface SongSummary {
  id: number;
  title: string;
  album_id: number;
  listens: number;
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

const toSongSummary = (song: SongEntity): SongSummary => ({
  id: song.id,
  title: song.title,
  album_id: song.album_id,
  listens: song.listens,
});

const toAlbumSong = (song: SongEntity): AlbumSong => ({
  id: song.id,
  title: song.title,
  object_ref: song.object_ref,
});

async function findEntityById(id: number): Promise<SongEntity | null> {
  const { rows } = await pool.query<SongEntity>(songSql.findById, [id]);
  return rows[0] ?? null;
}

export const songRepository = {
  async searchByTitle(query: string, limit = 20): Promise<SongSummary[]> {
    const { rows } = await pool.query<SongEntity>(songSql.searchByTitle, [
      `%${query}%`,
      limit,
    ]);
    return rows.map(toSongSummary);
  },

  async findById(id: number): Promise<SongDetail | null> {
    const song = await findEntityById(id);
    if (!song) return null;

    // FK on songs.album_id guarantees the album exists.
    const album = await albumRepository.findById(song.album_id);
    if (!album) return null;

    return {
      id: song.id,
      title: song.title,
      object_ref: song.object_ref,
      album_id: song.album_id,
      album_title: album.title,
    };
  },

  async listByAlbumId(albumId: number): Promise<AlbumSong[]> {
    const { rows } = await pool.query<SongEntity>(songSql.listByAlbumId, [
      albumId,
    ]);
    return rows.map(toAlbumSong);
  },
};
