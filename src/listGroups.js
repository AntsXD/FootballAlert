import "dotenv/config";
import { connectWhatsApp } from "./whatsapp.js";

/**
 * One-off helper: connect to WhatsApp and print all your group chats so you
 * can copy the one you want alerts sent to (its id looks like 120363xxx@g.us).
 * Paste it into WHATSAPP_GROUP_ID in .env.
 *
 *   npm run list
 */
async function main() {
  console.log("⏳ Connecting to WhatsApp...");
  const sock = await connectWhatsApp();

  const groups = await sock.groupFetchAllParticipating();
  const rows = Object.values(groups).sort((a, b) =>
    (a.subject || "").localeCompare(b.subject || "")
  );

  if (!rows.length) {
    console.log("No groups found on this account.");
  } else {
    console.log(`\n📋 Your groups (${rows.length}):\n`);
    console.log(
      rows
        .map((g) => `  • ${g.subject}\n      id: ${g.id}`)
        .join("\n\n")
    );
    console.log(
      "\nCopy the id of the group you want and set WHATSAPP_GROUP_ID in .env.\n"
    );
  }

  // Give Baileys a moment to flush, then exit.
  setTimeout(() => process.exit(0), 1500);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
