// Mirrors `albums` (db/migrations/001_init.sql) column for column.
export interface AlbumEntity {
  id: number;
  artist_id: number;
  title: string;
  released_at: Date | null;
  created_at: Date;
}
