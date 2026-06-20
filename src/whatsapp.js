import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

// Baileys needs a real pino instance (it calls logger.child internally).
// "silent" keeps it quiet while still providing the methods it expects.
const logger = pino({ level: "silent" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, "..", "auth_info");

/**
 * Connect to WhatsApp by linking your normal account (scan QR once).
 * Returns a promise that resolves with the socket once ready, and keeps
 * reconnecting automatically (re-reading the saved creds) unless you
 * explicitly log out.
 *
 * @param {(sock: import("@whiskeysockets/baileys").WASocket) => void} [onReady]
 */
export function connectWhatsApp({ onReady } = {}) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const start = async () => {
      // Persist the linked-session keys so you only scan the QR once.
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      // Fetch the WA Web protocol version compatible with this Baileys build.
      // A wrong version is the #1 cause of a 405-close before a QR appears.
      let version;
      try {
        const fetched = await fetchLatestWaWebVersion({});
        version = fetched?.version;
      } catch (e) {
        console.warn("Could not fetch WA Web version, using default:", e.message);
      }

      const sock = makeWASocket({
        auth: state,
        // Handle the QR ourselves via the connection.update event below
        // (printQRInTerminal is deprecated in current Baileys).
        browser: ["FootballAlert", "Chrome", "1.0.0"],
        logger, // real pino instance, temporarily at "warn"
        // Use the WA Web version fetched above (falls back to Baileys default
        // if the fetch failed). A mismatch here causes the 405 pre-QR loop.
        ...(version ? { version } : {}),
        // Don't force the bot account "online" on every connect — reduces
        // flapping that can lead to 405s.
        markOnlineOnConnect: false,
        // Longer default timeouts so a slow handshake isn't read as a failure.
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(
            "\n📱 Scan this QR with WhatsApp → Settings → Linked Devices → Link a device:\n"
          );
          qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
          console.log("✅ WhatsApp connected.\n");
          onReady?.(sock);
          if (!resolved) {
            resolved = true;
            resolve(sock);
          }
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          if (loggedOut) {
            if (!resolved) {
              resolved = true;
              reject(
                new Error(
                  "Logged out. Delete the auth_info folder to relink."
                )
              );
            }
            return;
          }
          console.warn("Connection closed, reconnecting...");
          start().catch((err) => {
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          });
        }
      });
    };

    start().catch((err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

/** Send a text message to a group (or any chat). */
export async function sendMessage(sock, jid, text) {
  return sock.sendMessage(jid, { text });
}
