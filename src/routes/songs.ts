import { Router } from "express";
import { asyncHandler } from "../asyncHandler.js";
import { songRepository } from "../repositories/songRepository.js";

export const songsRouter = Router();

songsRouter.get("/song/:id", asyncHandler(async (req, res) => {
  const songId = Number(req.params.id);
  if (!Number.isInteger(songId)) {
    res.status(400).json({ error: "song id must be an integer" });
    return;
  }

  const song = await songRepository.findById(songId);
  if (!song) {
    res.status(404).json({ error: "song not found" });
    return;
  }

  res.status(200).json(song);
}));

songsRouter.post("/song/:id/play", asyncHandler(async (req, res) => {
  const songId = Number(req.params.id);
  if (!Number.isInteger(songId)) {
    res.status(400).json({ error: "song id must be an integer" });
    return;
  }

  const listens = await songRepository.incrementListens(songId);
  if (listens === null) {
    res.status(404).json({ error: "song not found" });
    return;
  }

  res.status(200).json({ id: songId, listens });
}));
