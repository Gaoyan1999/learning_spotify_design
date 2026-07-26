import { Router } from "express";
import { pool } from "../db.js";

export const albumsRouter = Router();

albumsRouter.get("/album/:id/songs", async (req, res) => {
  const albumId = Number(req.params.id);
  if (!Number.isInteger(albumId)) {
    res.status(400).json({ error: "album id must be an integer" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, title, object_ref FROM songs WHERE album_id = $1 ORDER BY id`,
    [albumId],
  );

  res.status(200).json({ albumId, songs: rows });
});
