import { Router } from "express";
import { asyncHandler } from "../asyncHandler.js";
import { songRepository } from "../repositories/songRepository.js";

export const albumsRouter = Router();

albumsRouter.get("/album/:id/songs", asyncHandler(async (req, res) => {
  const albumId = Number(req.params.id);
  if (!Number.isInteger(albumId)) {
    res.status(400).json({ error: "album id must be an integer" });
    return;
  }

  const songs = await songRepository.listByAlbumId(albumId);
  res.status(200).json({ albumId, songs });
}));
