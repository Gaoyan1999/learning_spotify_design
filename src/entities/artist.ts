// Mirrors `artists` (db/migrations/001_init.sql) column for column.
export interface ArtistEntity {
  id: number;
  name: string;
  bio: string | null;
  created_at: Date;
}
