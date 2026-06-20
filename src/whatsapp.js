import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

// Baileys needs a real pino instance (it calls logger.child internally).
// Temporarily at "warn" to see why connections are closing — drop to "silent" once stable.
const logger = pino({ level: "warn" });

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

      const sock = makeWASocket({
        auth: state,
        // Handle the QR ourselves via the connection.update event below
        // (printQRInTerminal is deprecated in current Baileys).
        browser: ["FootballAlert", "Chrome", "1.0.0"],
        logger, // real pino instance, silenced
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
          console.log(
            `🔌 Connection closed. statusCode=${statusCode} reason=${
              lastDisconnect?.error?.message || "?"
            }`
          );
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
