import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, Colors } from 'discord.js';
import { requireOwner } from '../utils/permissions.js';
import { getSession, deleteSession } from '../workflow/ScanSession.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('stopscan')
  .setDescription('Immediately cancel any active scan or dry-scan session for this server.');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireOwner(interaction))) return;

  const guildId = interaction.guildId!;
  const session = getSession(guildId);

  if (!session) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('ℹ️ No Active Scan')
          .setDescription('There is no scan or dry-scan currently running on this server.')
          .setColor(Colors.Blurple)
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  const wasStage = session.stage;
  const wasDryRun = session.isDryRun;
  const scanId = session.id;

  // Mark cancelled and remove from registry
  session.stage = 'cancelled';
  deleteSession(guildId);

  logger.info('Scan force-stopped via /stopscan', {
    scanId,
    stage: wasStage,
    isDryRun: wasDryRun,
    userId: interaction.user.id,
    guildId,
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🛑 Scan Stopped')
        .setDescription(
          `The active ${wasDryRun ? 'dry-run' : ''} scan has been cancelled.\n\n` +
          `**Stage when stopped:** \`${wasStage}\`\n` +
          `**Scan ID:** \`${scanId}\`\n\n` +
          'No bans were executed. You can start a new scan at any time.',
        )
        .setColor(Colors.Red)
        .setTimestamp(),
    ],
  });
}
