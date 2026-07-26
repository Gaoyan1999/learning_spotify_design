import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const songsRouter = Router();

songsRouter.get("/song/:id", asyncHandler(async (req, res) => {
  const songId = Number(req.params.id);
  if (!Number.isInteger(songId)) {
    res.status(400).json({ error: "song id must be an integer" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.object_ref, s.album_id, a.title AS album_title
     FROM songs s
     JOIN albums a ON a.id = s.album_id
     WHERE s.id = $1`,
    [songId],
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "song not found" });
    return;
  }

  res.status(200).json(rows[0]);
}));
