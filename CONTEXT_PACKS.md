# Per-server context packs

Bender can attach a **published CSV** (or similar text) to a chat turn as ordinary prompt text. The first use case is a board-game **play tracker** spreadsheet: when someone asks about plays, winners, or stats, the bot downloads the sheet and includes it in that reply.

This is **not** a second grounding tool. `chooseGrounding` still picks **one** of `google_search`, `file_search`, or `none`. The CSV is injected the same way `/people` names are: extra text in the prompt. Google Search or File Search can still run on that same reply.

The published URL is a **capability secret**. Anyone who has it can read the sheet. Do not commit it, do not paste it in a public channel, and the bot will not log or echo the full URL.

## 1. Publish the sheet as CSV

### Google Sheets (typical)

1. Open the play-tracker spreadsheet.
2. Use a tab that is already a table (header row + one play per row).
3. **File → Share → Publish to web**.
4. Pick that tab and **Comma-separated values (.csv)**.
5. Publish and copy the URL. It looks like `https://docs.google.com/spreadsheets/d/e/…/pub?…&output=csv`.
6. Treat that link like a password. Prefer a sheet that does not include emails, addresses, or anything you would not put in Discord.

You can also use **File → Share** with “anyone with the link” and an export URL:

`https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=<TAB_GID>`

That is still a capability URL.

### S3 or any static HTTPS file

Upload a `.csv` (or `.tsv` / plain text table) and use an `https://` object URL. Same rules: don’t commit the URL; rotate it if it leaks.

## 2. Register the URL on the Discord server

Anyone in the server can register a pack:

```
/context add url:<published-csv> name:plays kind:plays
```

- `name` defaults to `plays`. Use a short slug (`plays`, `house-rules`). You can register more than one pack later.
- `kind:plays` attaches on **games/stats** questions (plays, wins, scores, game night, “have we played X”).
- `kind:general` attaches for house-rules / named-pack questions, or when the pack name is mentioned.

Other commands (all ephemeral; URLs are shown redacted as `https://host/…`):

```
/context list
/context remove name:plays
/context refresh
/context refresh name:plays
```

`/context refresh` clears the 10-minute fetch cache so the next matching mention downloads again.

The bot does a one-time fetch when you add a pack so you can see whether the URL is reachable. A failure there does not unset the pack; chat will retry later.

## 3. What a play-tracker CSV should look like

A header row plus one session per row is enough. Names can match Discord nicks or `/people` real names.

```text
Date,Game,Players,Winner,Notes
2026-01-04,Azul,Shane/Will,Shane,
2026-01-11,Catan,Shane/Will/Alex,Will,3p
```

Keep it to a size that can fit in a prompt (hundreds of rows is usually fine). If a sheet is huge, Bender keeps the header and rows that look relevant to that question.

## 4. How chat uses it

1. Someone **mentions** Bender.
2. A heuristic looks at **this turn’s** user message (not earlier history). Empty or missing `message.content` does **not** fall back to prior turns. Ordinary chat (“high”, “how’s it going”) does **not** fetch.
3. Games/stats (or a matching general-pack question) → HTTPS GET the published URL. The fetch refuses private/loopback/link-local hosts, IPv6-mapped / SIIT / NAT64 (including RFC 8215 `64:ff9b:1::/48`), Teredo, ISATAP, and 6to4 aliases, and redirects to those targets (at most 3 fetches). Resolved addresses are pinned so a later DNS answer cannot retarget the connect.
4. Cache the body for **10 minutes**.
5. Attach the table to **that turn’s** prompt. The grounding router has already chosen google / file search / none and is unchanged.

If the download fails (including a stored URL that is no longer allowed), Bender still replies without the sheet, and the model is told that pack could not be loaded so it should not invent the missing data. A stale cached copy may be reused after a later fetch error.

## 5. Later packs

The setting is a list of `{ name, kind, url }` packs on the guild, not a board-game-only flag. Add another published CSV with a new `name` when you want house rules, a campaign bible, and so on. SQLite play import and the Google Sheets API are out of scope here.
