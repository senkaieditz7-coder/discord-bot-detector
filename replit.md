# Discord Bot Detector

A Discord bot that detects and removes fake/botted members from your server using a multi-stage review workflow. Scan members, review flagged accounts across two stages, rescue any false positives, then execute bans — all through Discord slash commands.

## Run & Operate

- **Bot workflow** runs automatically: `Discord Bot` — uses `pnpm --filter @workspace/discord-bot run dev`
- `pnpm --filter @workspace/discord-bot run deploy-commands` — register slash commands with Discord (run once after bot token setup, or after adding new commands)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Required Secrets

| Secret | Description |
|--------|-------------|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal → Bot → Token |
| `DISCORD_APPLICATION_ID` | App ID from Developer Portal → General Information |
| `DISCORD_GUILD_ID` | Your server ID (for instant command registration) |

## Bot Commands

| Command | Description |
|---------|-------------|
| `/scan` | Full scan — detects bots and starts the ban workflow |
| `/dryscan` | Dry run — same detection, no bans. Use to verify accuracy first |

Only the owner (user ID in `src/config.ts`) can run commands.

## Detection Signals (7 total)

- **Account Age** — very new accounts (max 30 pts)
- **Join Wave** — large bursts of joins in short windows (max 25 pts)
- **Username Pattern** — random strings, consecutive digits, bot patterns (max 20 pts)
- **Avatar** — no avatar or default avatar (max 15 pts)
- **Sequential Creation** — accounts created in rapid sequence (max 10 pts)
- **No Roles** — only @everyone (max 5 pts)
- **Profile Customization** — no banner or display name (max 8 pts)

Thresholds: High Confidence ≥ 65 | Possible Fake ≥ 35

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord.js 14
- SQLite (node:sqlite built-in) for scan logs
- Winston for logging
- Bot lives in `artifacts/discord-bot/`

## Architecture Decisions

- One active scan session per guild at a time (enforced by `ScanSession.ts`)
- 3-stage confirmation before any bans (Stage 1 → Stage 2 → Final Review)
- Rescue system: mention members in chat during review to save them from bans
- BAN_DELAY_MS = 1500ms between each ban to respect Discord rate limits
- Scan logs stored in `artifacts/discord-bot/data/bot.db` (gitignored)

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- GuildMembers and MessageContent are **privileged intents** — must be enabled in Discord Developer Portal → Applications → [App] → Bot → Privileged Gateway Intents
- After adding new slash commands, re-run `deploy-commands` to register them
- DISCORD_GUILD_ID set → commands register instantly; without it → up to 1 hour delay
