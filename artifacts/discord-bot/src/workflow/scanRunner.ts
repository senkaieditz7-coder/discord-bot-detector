import {
  type ChatInputCommandInteraction,
  type TextChannel,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import {
  createSession,
  deleteSession,
  type ScanSession,
} from './ScanSession.js';
import { buildDetectionContext, analyzeMember } from '../detection/engine.js';
import { buildProgressEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { PROGRESS_UPDATE_EVERY } from '../config.js';
import { showStage1 } from './stage1.js';

/**
 * Core scan runner.
 * Fetches all non-bot guild members, analyses each one with the detection
 * engine, shows a live progress embed, then hands off to Stage 1.
 */
export async function runScan(
  interaction: ChatInputCommandInteraction,
  isDryRun: boolean,
): Promise<void> {
  const guild = interaction.guild!;
  const channel = interaction.channel as TextChannel;
  const session = createSession(guild.id, channel.id, isDryRun);

  // Defer so Discord doesn't time out — scan can take minutes
  await interaction.deferReply();

  try {
    logger.info('Scan started', { scanId: session.id, guildId: guild.id, isDryRun });

    // Initial status embed while member list loads
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(isDryRun ? '🔍 Dry Run — Fetching members…' : '🔍 Scan — Fetching members…')
          .setDescription('Loading the full member list from Discord. This may take a moment for large servers.')
          .setColor(isDryRun ? Colors.Blue : Colors.Orange)
          .setTimestamp(),
      ],
    });

    // Fetch EVERY member (requires GuildMembers privileged intent)
    const collection = await guild.members.fetch();
    const allMembers = [...collection.values()].filter(m => !m.user.bot);
    const total = allMembers.length;

    logger.info('Members fetched', { count: total, scanId: session.id });

    // Pre-compute context that requires the full list (join waves, etc.)
    const ctx = buildDetectionContext(allMembers);

    const startMs = Date.now();
    let scanned = 0;

    for (const member of allMembers) {
      const result = analyzeMember(member, ctx);
      session.allResults.push(result);

      if (result.riskLevel === 'high') session.highConfidence.push(result);
      else if (result.riskLevel === 'possible') session.possibleFake.push(result);

      scanned++;

      // Update progress embed periodically
      if (scanned % PROGRESS_UPDATE_EVERY === 0 || scanned === total) {
        const elapsedMs = Date.now() - startMs;
        const rate = scanned / (elapsedMs / 1000); // members per second
        const etaSec = rate > 0 ? Math.ceil((total - scanned) / rate) : null;

        await interaction.editReply({
          embeds: [
            buildProgressEmbed({
              isDryRun,
              scanned,
              total,
              highConfidence: session.highConfidence.length,
              possibleFake: session.possibleFake.length,
              estimatedSecondsRemaining: etaSec,
            }),
          ],
        }).catch(() => { /* ignore edit race conditions */ });
      }
    }

    // Sort both lists descending by score so worst offenders appear first
    session.highConfidence.sort((a, b) => b.score - a.score);
    session.possibleFake.sort((a, b) => b.score - a.score);

    // Initialise per-stage pending lists
    session.stage1Pending = [...session.highConfidence];
    session.stage2Pending = [...session.possibleFake];

    logger.info('Scan complete', {
      scanId: session.id,
      total,
      high: session.highConfidence.length,
      possible: session.possibleFake.length,
    });

    // Move to Stage 1
    await showStage1(interaction, session, channel);
  } catch (err) {
    logger.error('Scan failed', { error: err, scanId: session.id });
    deleteSession(guild.id);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Scan Failed')
          .setDescription(
            `An error occurred while scanning:\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``,
          )
          .setColor(Colors.Red)
          .setTimestamp(),
      ],
    });
  }
}
