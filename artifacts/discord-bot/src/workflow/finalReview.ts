import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ComponentType,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { type ScanSession, deleteSession } from './ScanSession.js';
import {
  buildFinalReviewEmbed,
  buildFinalSelectRow,
  buildCancelledEmbed,
  buildDryRunCompleteEmbed,
} from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { INTERACTION_TIMEOUT_MS } from '../config.js';
import { executeBans } from './banProcess.js';
import { queries } from '../database/queries.js';

export async function showFinalReview(
  interaction: ChatInputCommandInteraction,
  session: ScanSession,
  channel: TextChannel,
): Promise<void> {
  session.stage = 'finalReview';

  const totalPending = session.stage1Pending.length + session.stage2Pending.length;

  const reviewMsg = await interaction.followUp({
    embeds: [buildFinalReviewEmbed(session)],
    components: [buildFinalSelectRow(session.id, session.isDryRun, totalPending)],
  });

  const collector = reviewMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: i => i.user.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
    max: 1,
  });

  collector.on('collect', async selectMenu => {
    // ── Acknowledge IMMEDIATELY — must happen within 3 seconds ────────────────
    // deferUpdate() tells Discord "we got it" without changing the message yet.
    // All async work (DB writes, bans) happens after this point safely.
    await selectMenu.deferUpdate();

    const value = selectMenu.values[0];
    const scanId = session.id;

    // ── Cancel ────────────────────────────────────────────────────────────────
    if (value === 'cancel') {
      session.stage = 'cancelled';
      deleteSession(session.guildId);
      await selectMenu.editReply({
        embeds: [buildCancelledEmbed()],
        components: [],
      });
      logger.info('Scan cancelled at final review', { scanId });
      return;
    }

    // ── Dry run finish ────────────────────────────────────────────────────────
    if (value === 'dry_run_finish') {
      session.stage = 'complete';

      queries.insertScanLog({
        scanId,
        guildId: session.guildId,
        isDryRun: true,
        startedAt: session.startedAt.toISOString(),
        totalScanned: session.allResults.length,
        totalHigh: session.highConfidence.length,
        totalPossible: session.possibleFake.length,
        totalBanned: 0,
        totalRescued: session.rescuedIds.size,
      });

      queries.insertMemberLogsBatch(
        session.allResults.map(r => ({
          scanId,
          guildId: session.guildId,
          userId: r.member.id,
          username: r.member.user.username,
          confidence: r.score,
          riskLevel: r.riskLevel,
          reasons: r.reasons,
          wasRescued: session.rescuedIds.has(r.member.id),
          wasBanned: false,
          banStatus: 'dry_run' as const,
        })),
      );

      deleteSession(session.guildId);
      await selectMenu.editReply({
        embeds: [
          buildDryRunCompleteEmbed({
            wouldBanHigh: session.stage1Pending.length,
            wouldBanPossible: session.stage2Pending.length,
            rescued: session.rescuedIds.size,
            scanId,
          }),
        ],
        components: [],
      });
      logger.info('Dry run completed', { scanId });
      return;
    }

    // ── Ban confirmed ─────────────────────────────────────────────────────────
    if (value === 'ban_confirm') {
      session.stage = 'banning';
      await selectMenu.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⛔ Ban process starting…')
            .setDescription('Selection received. Beginning ban sequence.')
            .setColor(Colors.DarkRed)
            .setTimestamp(),
        ],
        components: [],
      });
      await executeBans(interaction, session, channel);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      deleteSession(session.guildId);
      reviewMsg.edit({ content: '⏰ Session expired.', components: [] }).catch(() => {});
    }
  });
}
