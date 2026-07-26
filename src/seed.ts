import "dotenv/config";
import { pool } from "./db.js";

async function main() {
  await pool.query("BEGIN");
  try {
    await pool.query(
      "TRUNCATE songs, albums, artists, users RESTART IDENTITY CASCADE",
    );

    const { rows: artists } = await pool.query<{ id: number }>(
      `INSERT INTO artists (name, bio) VALUES
        ('Fred Again..', 'UK electronic producer'),
        ('AlgoJS', 'System design channel')
      RETURNING id`,
    );
    const [fredId, algoId] = artists.map((a) => a.id);

    const { rows: albums } = await pool.query<{ id: number }>(
      `INSERT INTO albums (artist_id, title, released_at) VALUES
        ($1, 'Actual Life 3', '2022-10-21'),
        ($2, 'Design Talks', '2023-01-01')
      RETURNING id`,
      [fredId, algoId],
    );
    const [actualLifeId, designTalksId] = albums.map((a) => a.id);

    await pool.query(
      `INSERT INTO songs (album_id, title, object_ref) VALUES
        ($1, 'Danielle (smile on my face)', 'blob://songs/danielle.mp3'),
        ($1, 'Bleu (better with time)', 'blob://songs/bleu.mp3'),
        ($2, 'Designing Spotify', 'blob://songs/designing-spotify.mp3')`,
      [actualLifeId, designTalksId],
    );

    await pool.query("COMMIT");
    console.log("seed complete");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
