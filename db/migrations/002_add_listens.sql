ALTER TABLE songs ADD COLUMN listens INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_songs_listens ON songs (listens DESC);
