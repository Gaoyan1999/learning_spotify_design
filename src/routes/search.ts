import { Router } from "express";
import { asyncHandler } from "../asyncHandler.js";
import { songRepository } from "../repositories/songRepository.js";
import { artistRepository } from "../repositories/artistRepository.js";

export const searchRouter = Router();

searchRouter.get("/search", asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "query param 'q' is required" });
    return;
  }

  const [songs, artists] = await Promise.all([
    songRepository.searchByTitle(q),
    artistRepository.searchByName(q),
  ]);

  res.status(200).json({ songs, artists });
}));
