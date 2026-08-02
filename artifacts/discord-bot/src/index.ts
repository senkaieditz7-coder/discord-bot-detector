import 'discord.js';
import { Events, type Interaction } from 'discord.js';
import { client } from './client.js';
import * as scan from './commands/scan.js';
import * as dryscan from './commands/dryscan.js';
import { logger } from './utils/logger.js';

// ── Command registry ──────────────────────────────────────────────────────────
const commands = new Map([
  [scan.data.name, scan],
  [dryscan.data.name, dryscan],
]);

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, readyClient => {
  logger.info(`Bot online as ${readyClient.user.tag}`);
  logger.info(`Serving ${readyClient.guilds.cache.size} guild(s)`);
});

// ── Slash commands ────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn('Unknown command received', { name: interaction.commandName });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('Unhandled error in command', { command: interaction.commandName, error: err });
    const payload = {
      content: '❌ An unexpected error occurred. Check bot logs for details.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info(`Received ${signal} — shutting down gracefully`);
  client.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Unhandled rejection safety net ────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

// ── Connect to Discord ────────────────────────────────────────────────────────
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  logger.error('DISCORD_BOT_TOKEN is not set — cannot start bot');
  process.exit(1);
}

client.login(token).catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string | number })?.code;
  logger.error(`Failed to log in to Discord: ${message}${code ? ` (code: ${code})` : ''}`);
  process.exit(1);
});
