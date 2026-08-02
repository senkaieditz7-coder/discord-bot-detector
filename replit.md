# Discord Bot Detector

A Discord bot that identifies and removes fake/botted members from a server using a weighted confidence scoring system with multi-stage manual approval workflows.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — run the Discord bot (uses `tsx` for TypeScript)
- `pnpm --filter @workspace/discord-bot run deploy-commands` — register slash commands with Discord (run once, or after changing commands)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord: discord.js v14 (slash commands, button interactions, message collectors)
- Database: Node.js built-in `node:sqlite` (no native deps)
- Logging: winston (file + console transport)

## Where things live

- `artifacts/discord-bot/src/config.ts` — owner ID, scoring thresholds, timing constants
- `artifacts/discord-bot/src/detection/engine.ts` — orchestrates all detection signals
- `artifacts/discord-bot/src/detection/signals/` — individual heuristic modules (add new ones here)
- `artifacts/discord-bot/src/workflow/` — multi-stage scan state machine
- `artifacts/discord-bot/src/database/` — SQLite schema + queries via `node:sqlite`
- `artifacts/discord-bot/data/bot.db` — SQLite database (created at runtime)
- `artifacts/discord-bot/logs/` — winston log files (created at runtime)

## Architecture decisions

- **Weighted scoring, not binary flags** — each signal contributes a score; multiple weak signals combine before anyone is flagged.
- **`node:sqlite` (built-in)** — chosen over `better-sqlite3` to avoid native build deps (Python/node-gyp unavailable).
- **In-memory session state** — scan sessions live in a `Map<guildId, ScanSession>`; one active scan per guild.
- **Rescue system** — `messageCreate` collector listens for owner mentions during Stage 1 & 2, immediately removing mentioned members from pending lists.
- **Triple confirmation** — three separate button clicks required before any ban executes.
- **Dry run flag** — identical detection pipeline; final step shows summary instead of banning.

## Product

Slash commands:
- `/scan` — full workflow: scan → Stage 1 (high confidence) → Stage 2 (possible fake) → final review → triple-confirm → ban
- `/dryscan` — identical detection, shows everything, never modifies any member

Detection signals (all additive):
1. Account age (max 30 pts)
2. Default avatar (15 pts)
3. Username pattern — entropy, digit runs, bot patterns (max 20 pts)
4. Join wave — 5+ members in 1-hour window (max 25 pts)
5. Sequential account creation (15 pts)
6. No roles assigned (5 pts)
7. Profile customization — no banner/global name (max 8 pts)

Score thresholds: ≥65 = High Confidence (Stage 1), ≥35 = Possible Fake (Stage 2)

## User preferences

- Owner Discord ID: `1472802482152542410`
- Never auto-ban; every action requires manual approval
- Prioritise minimising false positives over catching more bots
- New detection heuristics should be added by creating a new file in `src/detection/signals/` and appending to the `signals` array in `engine.ts`

## Gotchas

- The bot requires three privileged intents: **Server Members Intent**, **Message Content Intent** (and optionally Presence Intent). Enable all three under Bot → Privileged Gateway Intents in the Discord Developer Portal.
- Run `pnpm --filter @workspace/discord-bot run deploy-commands` once after first setup (or after changing command definitions) before the slash commands appear in Discord.
- `DISCORD_GUILD_ID` env var is optional: set it to your server ID for instant command registration during development (vs. up to 1 hour for global registration).
- `node:sqlite` is stable in Node.js 24 with no flags needed.
