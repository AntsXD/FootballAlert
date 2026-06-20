import "dotenv/config";
import {
  connectWhatsApp,
} from "./whatsapp.js";
import {
  getCompetitionMatches,
  getFinishedMatches,
  getLiveMatches,
  getNextMatch,
  formatFinishedMatch,
  formatLiveMatch,
  formatNextMatch,
} from "./data.js";
import {
  shouldAnnounce,
  markAnnounced,
  shouldSendBootGreeting,
  markBootGreetingSent,
} from "./store.js";

const args = new Set(process.argv.slice(2));
const MODE_LINK = args.has("--link");
const MODE_CHECK = args.has("--check");

const GROUP_ID = process.env.WHATSAPP_GROUP_ID;
const COMPETITION = process.env.COMPETITION_CODE || "WC";
const POLL_MS = (Number(process.env.POLL_INTERVAL_MIN) || 2) * 60 * 1000;
const ALERT_LIVE = (process.env.ALERT_LIVE || "false").toLowerCase() === "true";
// One-time greeting posted to the group when the bot boots. Set
// BOOT_GREETING=false (or empty) to disable. Supports \n for line breaks.
const BOOT_GREETING = (process.env.BOOT_GREETING || "")
  .replace(/\\n/g, "\n")
  .trim();
// Only send the boot greeting once per calendar day (default: true).
// Set BOOT_GREETING_DAILY=false to send it on every boot instead.
const BOOT_GREETING_DAILY =
  (process.env.BOOT_GREETING_DAILY || "true").toLowerCase() === "true";
// Append the next upcoming fixture to the greeting (default: true).
const BOOT_GREETING_FIXTURE =
  (process.env.BOOT_GREETING_FIXTURE || "true").toLowerCase() === "true";

let sock = null;

/**
 * Fetch the competition matches and announce anything new (full-time,
 * and optionally live score changes) to the group.
 */
async function pollOnce() {
  if (!GROUP_ID) {
    console.warn(
      "⚠️  WHATSAPP_GROUP_ID not set — run `npm run list` to find your group id."
    );
    return;
  }
  try {
    const matches = await getCompetitionMatches(COMPETITION);

    // --- Full-time alerts ---
    const finished = getFinishedMatches(matches);
    for (const m of finished) {
      const score = `${m.score?.fullTime?.home}-${m.score?.fullTime?.away}`;
      const key = `${m.id}:ft`;
      if (await shouldAnnounce(key, score)) {
        const text = formatFinishedMatch(m);
        console.log("📣 Sending:", text);
        await sock.sendMessage(GROUP_ID, { text });
        await markAnnounced(key, score);
      }
    }

    // --- Optional live score-change alerts ---
    if (ALERT_LIVE) {
      const live = getLiveMatches(matches);
      for (const m of live) {
        const score = `${m.score?.fullTime?.home ?? m.score?.home ?? 0}-${
          m.score?.fullTime?.away ?? m.score?.away ?? 0
        }`;
        const key = `${m.id}:live`;
        if (await shouldAnnounce(key, score)) {
          const text = formatLiveMatch(m);
          console.log("📣 Sending:", text);
          await sock.sendMessage(GROUP_ID, { text });
          await markAnnounced(key, score);
        }
      }
    }

    console.log(
      `[${new Date().toLocaleTimeString()}] Checked ${finished.length} finished${
        ALERT_LIVE ? `, ${getLiveMatches(matches).length} live` : ""
      } matches.`
    );
  } catch (err) {
    console.error("Poll error:", err.message);
  }
}

/** One-off dry run: print what would be announced without sending anything. */
async function checkOnce() {
  const matches = await getCompetitionMatches(COMPETITION);
  const finished = getFinishedMatches(matches);
  const live = getLiveMatches(matches);
  console.log(
    `Competition '${COMPETITION}': ${matches.length} total, ${live.length} live, ${finished.length} finished.\n`
  );
  if (finished.length) {
    console.log("Recent full-time results:");
    for (const m of finished.slice(-10)) {
      console.log("  " + formatFinishedMatch(m).replace(/\n/g, "  "));
    }
  }
  if (live.length) {
    console.log("\nIn play right now:");
    for (const m of live) {
      console.log("  " + formatLiveMatch(m));
    }
  }
}

/** Post a greeting to the group when the bot starts (once per day, if configured). */
async function sendBootGreeting() {
  if (!BOOT_GREETING) return;
  if (!GROUP_ID) {
    console.warn(
      "⚠️  BOOT_GREETING is set but WHATSAPP_GROUP_ID is not — skipping greeting."
    );
    return;
  }

  // Once-per-day throttle so restarts/crash-recovery don't spam the group.
  if (BOOT_GREETING_DAILY && !(await shouldSendBootGreeting())) {
    console.log("👋 Boot greeting already sent today — skipping.");
    return;
  }

  // Build the message, optionally appending the next upcoming fixture.
  let text = BOOT_GREETING;
  if (BOOT_GREETING_FIXTURE) {
    try {
      const matches = await getCompetitionMatches(COMPETITION);
      const next = getNextMatch(matches);
      if (next) text = `${BOOT_GREETING}\n${formatNextMatch(next)}`;
    } catch (err) {
      console.warn(
        "Could not fetch next fixture for greeting:",
        err.message
      );
    }
  }

  try {
    await sock.sendMessage(GROUP_ID, { text });
    if (BOOT_GREETING_DAILY) await markBootGreetingSent();
    console.log("👋 Boot greeting sent to the group.");
  } catch (err) {
    console.error("Could not send boot greeting:", err.message);
  }
}

async function main() {
  // --check: just query the football API and print, no WhatsApp needed.
  if (MODE_CHECK) {
    console.log("🔎 Checking football-data.org…\n");
    await checkOnce();
    return;
  }

  console.log("⏳ Connecting to WhatsApp...");
  sock = await connectWhatsApp();

  // --link: connect, wait a moment so the session is saved, then exit.
  // Use this the first time to scan the QR and persist auth_info.
  if (MODE_LINK) {
    console.log("✅ Linked. You can stop the process (Ctrl+C) and run `npm start`.");
    // Keep alive briefly so creds.save completes.
    setTimeout(() => process.exit(0), 3000);
    return;
  }

  // Normal run mode: greet the group, then start polling.
  await sendBootGreeting();

  console.log(
    `🔎 Watching competition '${COMPETITION}', polling every ${
      POLL_MS / 1000
    }s.`
  );

  // Run an immediate check, then start the interval.
  await pollOnce();
  setInterval(pollOnce, POLL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
