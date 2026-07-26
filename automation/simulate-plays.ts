import "dotenv/config";

const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

const songWeights: Record<number, number> = {
  1: 5, // Danielle (smile on my face) - most popular
  2: 3, // Bleu (better with time)
  3: 1, // Designing Spotify - least popular
};

const numUsers = Number(process.env.NUM_USERS ?? 10);
const durationMs = Number(process.env.DURATION_MS ?? 20_000);
const minDelayMs = Number(process.env.MIN_DELAY_MS ?? 200);
const maxDelayMs = Number(process.env.MAX_DELAY_MS ?? 1_000);

const songIds = Object.keys(songWeights).map(Number);
const totalWeight = songIds.reduce((sum, id) => sum + songWeights[id], 0);

function pickWeightedSongId(): number {
  let roll = Math.random() * totalWeight;
  for (const id of songIds) {
    roll -= songWeights[id];
    if (roll <= 0) return id;
  }
  return songIds[songIds.length - 1];
}

function randomDelay(): number {
  return minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const playCounts: Record<number, number> = Object.fromEntries(songIds.map((id) => [id, 0]));
let errorCount = 0;

async function playOnce(songId: number): Promise<void> {
  const res = await fetch(`${baseUrl}/api/song/${songId}/play`, { method: "POST" });
  if (!res.ok) {
    errorCount++;
    console.error(`play failed for song ${songId}: ${res.status}`);
    return;
  }
  playCounts[songId]++;
}

async function simulateUser(userId: number, stopAt: number): Promise<void> {
  while (Date.now() < stopAt) {
    const songId = pickWeightedSongId();
    await playOnce(songId);
    await sleep(randomDelay());
  }
  void userId;
}

async function main() {
  console.log(
    `simulating ${numUsers} users against ${baseUrl} for ${durationMs}ms ` +
      `(weights: ${JSON.stringify(songWeights)})`,
  );

  const stopAt = Date.now() + durationMs;
  const users = Array.from({ length: numUsers }, (_, i) => simulateUser(i, stopAt));
  await Promise.all(users);

  console.log("done");
  console.log("plays sent per song:", playCounts);
  console.log("failed requests:", errorCount);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
