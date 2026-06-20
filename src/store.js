import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(__dirname, "..", "data", "state.json");

/**
 * Simple JSON-backed store so we don't re-announce the same match twice
 * and don't need a database. Shape:
 *   { "matchId": { announced: true, lastScore: "2-1" } }
 */
async function ensureStore() {
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
    await fs.writeFile(STORE_FILE, "{}");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  return JSON.parse(raw || "{}");
}

async function writeStore(state) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(state, null, 2));
}

export async function shouldAnnounce(matchId, currentScore) {
  const state = await readStore();
  const entry = state[matchId];
  // Announce if we've never announced it, or the score has changed since last time.
  return !entry || entry.lastScore !== currentScore;
}

export async function markAnnounced(matchId, lastScore) {
  const state = await readStore();
  state[matchId] = { announced: true, lastScore };
  await writeStore(state);
}

/** Returns true if the boot greeting has NOT already been sent today (local date). */
export async function shouldSendBootGreeting() {
  const state = await readStore();
  const today = new Date().toLocaleDateString(); // e.g. "6/20/2026"
  return state.__bootGreetingDate !== today;
}

/** Record that the boot greeting was sent today, so we don't repeat it. */
export async function markBootGreetingSent() {
  const state = await readStore();
  state.__bootGreetingDate = new Date().toLocaleDateString();
  await writeStore(state);
}
