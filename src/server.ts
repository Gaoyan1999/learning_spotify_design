import "dotenv/config";
import express from "express";
import { searchRouter } from "./routes/search.js";
import { albumsRouter } from "./routes/albums.js";
import { songsRouter } from "./routes/songs.js";
import { debugRouter } from "./routes/debug.js";

const app = express();
app.use(express.json());

app.use("/api", searchRouter);
app.use("/api", albumsRouter);
app.use("/api", songsRouter);
app.use("/api", debugRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  },
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`stage-1 server listening on http://localhost:${port}`);
});
