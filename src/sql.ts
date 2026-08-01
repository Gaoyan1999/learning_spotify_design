// All SQL for the repositories in one place, so query text isn't scattered
// across src/repositories/*.

export const songSql = {
  findById: `SELECT id, album_id, title, object_ref, created_at, listens
             FROM songs
             WHERE id = $1`,

  searchByTitle: `SELECT id, album_id, title, object_ref, created_at, listens
                  FROM songs
                  WHERE title ILIKE $1
                  ORDER BY listens DESC, title
                  LIMIT $2`,

  listByAlbumId: `SELECT id, album_id, title, object_ref, created_at, listens
                  FROM songs
                  WHERE album_id = $1
                  ORDER BY id`,
};

export const albumSql = {
  findById: `SELECT id, artist_id, title, released_at, created_at
             FROM albums
             WHERE id = $1`,
};

export const artistSql = {
  searchByName: `SELECT id, name, bio, created_at
                 FROM artists
                 WHERE name ILIKE $1
                 ORDER BY name
                 LIMIT $2`,
};
