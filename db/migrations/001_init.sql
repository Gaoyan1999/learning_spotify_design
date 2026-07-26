CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artists (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  bio        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE albums (
  id         SERIAL PRIMARY KEY,
  artist_id  INTEGER NOT NULL REFERENCES artists(id),
  title      TEXT NOT NULL,
  released_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE songs (
  id         SERIAL PRIMARY KEY,
  album_id   INTEGER NOT NULL REFERENCES albums(id),
  title      TEXT NOT NULL,
  object_ref TEXT NOT NULL, -- placeholder pointer into a blob store; unused until we add real storage
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_artists_name_lower ON artists (lower(name));
CREATE INDEX idx_albums_title_lower ON albums (lower(title));
CREATE INDEX idx_albums_artist_id ON albums (artist_id);
CREATE INDEX idx_songs_title_lower ON songs (lower(title));
CREATE INDEX idx_songs_album_id ON songs (album_id);
