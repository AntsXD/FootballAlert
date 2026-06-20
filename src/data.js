import "dotenv/config";

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE = "https://api.football-data.org/v4";

if (!API_KEY || API_KEY === "your_key_here") {
  console.warn("⚠️  FOOTBALL_DATA_API_KEY is not set. Edit .env and paste your key from football-data.org.");
}

const headers = { "X-Auth-Token": API_KEY || "" };

async function apiGet(pathname) {
  const res = await fetch(BASE + pathname, { headers });
  if (res.status === 429) {
    throw new Error("Rate limited by football-data.org (free tier: 10 req/min). Backing off.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org ${res.status}: ${body}`);
  }
  return res.json();
}

/** Get the current season plan (matchdays) for a competition. */
export async function getCompetitionMatches(competitionCode = "WC") {
  const data = await apiGet(`/competitions/${competitionCode}/matches`);
  return data.matches || [];
}

/** Get only matches finished since the last poll (status FINISHED). */
export function getFinishedMatches(matches) {
  return matches.filter((m) => m.status === "FINISHED");
}

/** Get matches that are currently in play (optional: live score alerts). */
export function getLiveMatches(matches) {
  return matches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
}

/** Pretty-print a finished match as a WhatsApp message. */
export function formatFinishedMatch(m) {
  const home = m.homeTeam?.name ?? "Home";
  const away = m.awayTeam?.name ?? "Away";
  const score = m.score?.fullTime ?? { home: m.score?.winner === "HOME_TEAM" ? 1 : 0, away: 0 };
  const stage = m.stage?.replace(/_/g, " ").toLowerCase() ?? "";
  const stageLine = stage ? `(${stage})` : "";
  return `⚽ *FULL TIME* ${stageLine}\n*${home}* ${score.home} – ${score.away} *${away}*`;
}

/** Live-score line (for optional in-play alerts). */
export function formatLiveMatch(m) {
  const home = m.homeTeam?.name ?? "Home";
  const away = m.awayTeam?.name ?? "Away";
  const score = m.score?.fullTime?.home != null ? m.score.fullTime : m.score ?? { home: 0, away: 0 };
  const minute = m.minute ? `${m.minute}'` : "LIVE";
  return `🔴 ${minute}  *${home}* ${score.home ?? 0} – ${score.away ?? 0} *${away}*`;
}

/** Get the next scheduled match (not yet started), soonest first. */
export function getNextMatch(matches) {
  const upcoming = matches
    .filter((m) => m.status === "SCHEDULED" || m.status === "TIMED")
    .filter((m) => m.utcDate)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  return upcoming[0] ?? null;
}

/** Pretty-print the next upcoming fixture as a WhatsApp line. */
export function formatNextMatch(m) {
  if (!m) return "📅 Next match: TBD";
  const home = m.homeTeam?.name ?? "Home";
  const away = m.awayTeam?.name ?? "Away";
  const when = new Date(m.utcDate).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const stage = m.stage?.replace(/_/g, " ").toLowerCase() ?? "";
  const stageLine = stage ? ` (${stage})` : "";
  return `📅 Next up${stageLine}: *${home}* vs *${away}* — ${when}`;
}
