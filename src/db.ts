import "dotenv/config";
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Without this listener, pg's Pool crashes the whole process when an idle
// client loses its connection (e.g. Postgres restarts or becomes unreachable).
pool.on("error", (err) => {
  console.error("unexpected error on idle pg client", err);
});
