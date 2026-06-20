# FootballAlert ⚽

Posts **2026 FIFA World Cup** results to a **WhatsApp group** using your
**normal WhatsApp account** — no WhatsApp Business API, no per-message cost.

- **Data source:** [football-data.org](https://www.football-data.org/) free tier
  (10 requests/minute — plenty at a 2-minute poll).
- **WhatsApp:** [Baileys](https://github.com/WhiskeySockets/Baileys), which links
  your regular WhatsApp like a second device. Scanning a QR once logs you in.
- **State:** a tiny JSON file — no database.

> ⚠️ Linking your personal account is against WhatsApp's ToS for automation and
> carries a small ban risk. Use a secondary number or a fresh account if you're
> cautious. The football-data.org free tier does **not** always include the World
> Cup in real time — see "Data notes" below.

---

## 1. Prerequisites

- **Node.js 18+** (`node -v`).
- A **football-data.org API key** — register free at
  <https://www.football-data.org/client/register>.
- A **WhatsApp account** that is a member of the group you want to post to.

## 2. Install

```bash
npm install
```

## 3. Configure

Copy the example env file and fill it in:

```bash
cp .env.example .env      # on Windows: copy .env.example .env
```

Then edit `.env`:

```env
FOOTBALL_DATA_API_KEY=<paste your key from football-data.org>
WHATSAPP_GROUP_ID=        # fill in after step 4
POLL_INTERVAL_MIN=2
COMPETITION_CODE=WC
ALERT_LIVE=false
```

## 4. Link WhatsApp and find your group ID

Link your account (scan the QR that appears — WhatsApp → Settings → Linked
Devices → Link a device):

```bash
npm run link
```

Then list your groups and copy the target group's `id` (looks like
`120363xxx@g.us`):

```bash
npm run list
```

Paste it into `WHATSAPP_GROUP_ID` in `.env`.

## 5. Test the data feed (no WhatsApp needed)

```bash
npm run check
```

This queries football-data.org and prints recent/finished/live matches so you
can confirm your key works and see what the bot would announce.

## 6. Run the bot

```bash
npm start
```

It polls every `POLL_INTERVAL_MIN` minutes and posts a full-time message to the
group for any match that just finished (and, if `ALERT_LIVE=true`, live score
changes too).

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Connect to WhatsApp and start polling + announcing. |
| `npm run link` | Link your WhatsApp account (scan QR once), then exit. |
| `npm run list` | Print all your group chats and their IDs. |
| `npm run check` | Dry-run: query the football API and print results, no WhatsApp. |

## How it avoids duplicate alerts

`data/state.json` records each announced match id (and last score). A match is
only re-announced if it hasn't been announced yet, or its score changed since
the last announcement. Delete that file to re-announce everything.

## Boot greeting

Set `BOOT_GREETING` in `.env` to post a message to the group when the bot
starts. Two refinements:

- **`BOOT_GREETING_DAILY=true`** (default) — only sends the greeting **once per
  calendar day**, so restarts/crash-recovery won't spam the group. The "already
  sent today" flag is stored in `data/state.json` under `__bootGreetingDate`.
  Delete that key (or set the option to `false`) to re-send.
- **`BOOT_GREETING_FIXTURE=true`** (default) — appends the **next upcoming
  fixture** to the greeting, e.g.:

  > 👋 FootballAlert is live! I'll post World Cup results here as they finish.
  > 📅 Next up (group stage): *Brazil* vs *Serbia* — Sun, Jun 28, 04:00 PM

## Data notes

- football-data.org's free tier covers a fixed set of European competitions and
  may update the World Cup on a delay (or require the premium tier during the
  tournament). If `npm run check` shows no World Cup data with your free key,
  the World Cup may not be available on the free plan — in that case you'd
  point `COMPETITION_CODE` at a free-tier competition, or swap the data source
  in `src/data.js` for another free API (e.g. the free tiers of
  API-Football / SportMonks).
- The free tier is limited to **10 requests/minute**, so keep
  `POLL_INTERVAL_MIN` at **2+**. One poll = one request.

## Troubleshooting

- **"Logged out"** — delete the `auth_info/` folder and run `npm run link`
  again to re-scan the QR.
- **No World Cup data** — see *Data notes* above; verify with `npm run check`.
- **Rate limited** — increase `POLL_INTERVAL_MIN`.
- **Bot posts nothing** — make sure the linked account is a member of the
  group, and that `WHATSAPP_GROUP_ID` matches exactly what `npm run list`
  printed.

## Files

```
.
├── .env                # your keys + group id (not committed)
├── .env.example
├── package.json
└── src
    ├── index.js        # entry: poller + announce loop, --link/--check modes
    ├── whatsapp.js     # Baileys connection + QR + reconnect
    ├── data.js         # football-data.org client + formatting
    ├── store.js        # JSON-backed "already announced?" state
    └── listGroups.js   # one-off helper to print your group IDs
```
