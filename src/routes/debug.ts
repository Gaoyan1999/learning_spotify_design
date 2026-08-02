import { Router } from "express";
import { asyncHandler } from "../asyncHandler.js";
import { listensBuffer } from "../repositories/listensBuffer.js";
import { listensQueue } from "../queue.js";

export const debugRouter = Router();

debugRouter.get("/debug/redis-listens/:id", asyncHandler(async (req, res) => {
  const songId = Number(req.params.id);
  if (!Number.isInteger(songId)) {
    res.status(400).json({ error: "song id must be an integer" });
    return;
  }

  const listens = await listensBuffer.get(songId);
  res.status(200).json({ id: songId, listens });
}));

debugRouter.get("/debug/queue-counts", asyncHandler(async (_req, res) => {
  const counts = await listensQueue.getJobCounts();
  res.status(200).json(counts);
}));
