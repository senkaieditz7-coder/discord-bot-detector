import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { requireOwner } from '../utils/permissions.js';
import { hasActiveSession } from '../workflow/ScanSession.js';
import { runScan } from '../workflow/scanRunner.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('dryscan')
  .setDescription(
    'Dry run: scan members with the full detection engine but never ban anyone. Use this to verify accuracy first.',
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireOwner(interaction))) return;

  const guildId = interaction.guildId!;
  if (hasActiveSession(guildId)) {
    await interaction.reply({
      content: '⚠️ A scan is already running for this server. Wait for it to finish before starting a new one.',
      ephemeral: true,
    });
    return;
  }

  logger.info('Dry run scan invoked', { userId: interaction.user.id, guildId });
  await runScan(interaction, true);
}
