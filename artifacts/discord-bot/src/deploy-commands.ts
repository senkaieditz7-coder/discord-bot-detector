/**
 * One-time script to register slash commands with Discord.
 * Run with: pnpm --filter @workspace/discord-bot run deploy-commands
 *
 * Guild-scoped registration (DISCORD_GUILD_ID set) → updates within seconds.
 * Global registration (no DISCORD_GUILD_ID)        → takes up to 1 hour.
 */
import { REST, Routes } from 'discord.js';
import * as scan from './commands/scan.js';
import * as dryscan from './commands/dryscan.js';
import * as stopscan from './commands/stopscan.js';
import { logger } from './utils/logger.js';

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID; // optional

if (!token) {
  logger.error('DISCORD_BOT_TOKEN is not set');
  process.exit(1);
}
if (!appId) {
  logger.error('DISCORD_APPLICATION_ID is not set');
  process.exit(1);
}

// After the guards above TypeScript still sees string|undefined; cast explicitly.
const safeAppId = appId as string;
const safeToken = token as string;

const commands = [scan.data.toJSON(), dryscan.data.toJSON(), stopscan.data.toJSON()];
const rest = new REST({ version: '10' }).setToken(safeToken);

async function main() {
  try {
    logger.info(`Registering ${commands.length} slash command(s)…`);

    let data: unknown;
    if (guildId) {
      data = await rest.put(
        Routes.applicationGuildCommands(safeAppId, guildId),
        { body: commands },
      );
      logger.info(`Commands registered for guild ${guildId}`);
    } else {
      data = await rest.put(
        Routes.applicationCommands(safeAppId),
        { body: commands },
      );
      logger.info('Commands registered globally (may take up to 1 hour)');
    }

    logger.info('Done', { data });
  } catch (err) {
    logger.error('Failed to register commands', { error: err });
    process.exit(1);
  }
}

main();
