import { Router } from "express";
import { pool } from "../db.js";

export const searchRouter = Router();

searchRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "query param 'q' is required" });
    return;
  }

  const like = `%${q}%`;

  const [songs, artists] = await Promise.all([
    pool.query(
      `SELECT id, title, album_id FROM songs WHERE title ILIKE $1 ORDER BY title LIMIT 20`,
      [like],
    ),
    pool.query(
      `SELECT id, name FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT 20`,
      [like],
    ),
  ]);

  res.status(200).json({
    songs: songs.rows,
    artists: artists.rows,
  });
});
