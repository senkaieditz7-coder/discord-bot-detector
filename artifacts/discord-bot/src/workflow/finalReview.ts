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
  buildConfirmationEmbed,
  buildFinalReviewRows,
  buildConfirmation2Rows,
  buildConfirmation3Rows,
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
    components: buildFinalReviewRows(session.id, session.isDryRun),
  });

  const collector = reviewMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
    max: 1,
  });

  collector.on('collect', async btn => {
    const id = btn.customId;

    // ── Dry run ends here ──────────────────────────────────────────────────
    if (session.isDryRun && id === `final_confirm1_${session.id}`) {
      session.stage = 'complete';

      // Log dry run results
      queries.insertScanLog({
        scanId: session.id,
        guildId: session.guildId,
        isDryRun: true,
        startedAt: session.startedAt.toISOString(),
        totalScanned: session.allResults.length,
        totalHigh: session.highConfidence.length,
        totalPossible: session.possibleFake.length,
        totalBanned: 0,
        totalRescued: session.rescuedIds.size,
      });

      const memberLogs = session.allResults.map(r => ({
        scanId: session.id,
        guildId: session.guildId,
        userId: r.member.id,
        username: r.member.user.username,
        confidence: r.score,
        riskLevel: r.riskLevel,
        reasons: r.reasons,
        wasRescued: session.rescuedIds.has(r.member.id),
        wasBanned: false,
        banStatus: 'dry_run' as const,
      }));
      queries.insertMemberLogsBatch(memberLogs);

      deleteSession(session.guildId);
      await btn.update({
        embeds: [
          buildDryRunCompleteEmbed({
            wouldBanHigh: session.stage1Pending.length,
            wouldBanPossible: session.stage2Pending.length,
            rescued: session.rescuedIds.size,
            scanId: session.id,
          }),
        ],
        components: [],
      });
      logger.info('Dry run completed', { scanId: session.id });
      return;
    }

    // ── Cancel ─────────────────────────────────────────────────────────────
    if (id === `final_cancel_${session.id}`) {
      session.stage = 'cancelled';
      deleteSession(session.guildId);
      await btn.update({ embeds: [buildCancelledEmbed()], components: [] });
      logger.info('Scan cancelled at final review', { scanId: session.id });
      return;
    }

    // ── Confirmation 1 of 3 ────────────────────────────────────────────────
    if (id === `final_confirm1_${session.id}`) {
      session.stage = 'confirming2';
      await btn.update({
        embeds: [buildConfirmationEmbed(2, totalPending)],
        components: buildConfirmation2Rows(session.id),
      });
      awaitConfirmation2(interaction, session, channel, reviewMsg);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      deleteSession(session.guildId);
      reviewMsg.edit({ content: '⏰ Session expired.', components: [] }).catch(() => {});
    }
  });
}

// ── Confirmation step 2 ───────────────────────────────────────────────────────
async function awaitConfirmation2(
  interaction: ChatInputCommandInteraction,
  session: ScanSession,
  channel: TextChannel,
  msg: Awaited<ReturnType<typeof interaction.followUp>>,
): Promise<void> {
  const totalPending = session.stage1Pending.length + session.stage2Pending.length;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
    max: 1,
  });

  collector.on('collect', async btn => {
    if (btn.customId === `final_cancel_${session.id}`) {
      session.stage = 'cancelled';
      deleteSession(session.guildId);
      await btn.update({ embeds: [buildCancelledEmbed()], components: [] });
      return;
    }
    if (btn.customId === `final_confirm2_${session.id}`) {
      session.stage = 'confirming3';
      await btn.update({
        embeds: [buildConfirmationEmbed(3, totalPending)],
        components: buildConfirmation3Rows(session.id),
      });
      awaitConfirmation3(interaction, session, channel, msg);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      deleteSession(session.guildId);
      msg.edit({ content: '⏰ Session expired.', components: [] }).catch(() => {});
    }
  });
}

// ── Confirmation step 3 (final) ───────────────────────────────────────────────
async function awaitConfirmation3(
  interaction: ChatInputCommandInteraction,
  session: ScanSession,
  channel: TextChannel,
  msg: Awaited<ReturnType<typeof interaction.followUp>>,
): Promise<void> {
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
    max: 1,
  });

  collector.on('collect', async btn => {
    if (btn.customId === `final_cancel_${session.id}`) {
      session.stage = 'cancelled';
      deleteSession(session.guildId);
      await btn.update({ embeds: [buildCancelledEmbed()], components: [] });
      return;
    }
    if (btn.customId === `final_confirm3_${session.id}`) {
      session.stage = 'banning';
      // Disable buttons to prevent double-clicks
      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setTitle('⛔ Ban process starting…')
            .setDescription('All three confirmations received. Beginning ban sequence.')
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
      msg.edit({ content: '⏰ Session expired.', components: [] }).catch(() => {});
    }
  });
}
