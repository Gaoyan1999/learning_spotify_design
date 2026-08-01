// Mirrors `songs` (db/migrations/001_init.sql, 002_add_listens.sql) column for column.
export interface SongEntity {
  id: number;
  album_id: number;
  title: string;
  object_ref: string;
  created_at: Date;
  listens: number;
}
