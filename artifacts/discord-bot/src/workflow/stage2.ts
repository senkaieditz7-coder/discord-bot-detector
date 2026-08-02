import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ComponentType,
} from 'discord.js';
import {
  type ScanSession,
  rescueMember,
  deleteSession,
} from './ScanSession.js';
import {
  buildStageEmbed,
  buildStageActionRows,
  buildDiscardedEmbed,
  buildNoMembersStageEmbed,
} from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { MEMBERS_PER_PAGE, INTERACTION_TIMEOUT_MS } from '../config.js';
import { showFinalReview } from './finalReview.js';

export async function showStage2(
  interaction: ChatInputCommandInteraction,
  session: ScanSession,
  channel: TextChannel,
): Promise<void> {
  session.stage = 'stage2';
  session.stage2Page = 0;

  if (session.stage2Pending.length === 0) {
    await interaction.followUp({
      embeds: [buildNoMembersStageEmbed(2, session.isDryRun)],
    });
    await showFinalReview(interaction, session, channel);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(session.stage2Pending.length / MEMBERS_PER_PAGE));

  const stageMsg = await interaction.followUp({
    embeds: [buildStageEmbed({ session, members: session.stage2Pending, stage: 2, page: 0 })],
    components: buildStageActionRows(session.id, 2, 0, totalPages, session.isDryRun),
  });

  // ── Rescue listener ────────────────────────────────────────────────────────
  const rescueCollector = channel.createMessageCollector({
    filter: msg => msg.author.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
  });

  rescueCollector.on('collect', msg => {
    let anyRescued = false;
    for (const [userId] of msg.mentions.users) {
      if (rescueMember(session, userId)) {
        anyRescued = true;
        logger.info('Member rescued via mention', { userId, stage: 2, scanId: session.id });
      }
    }
    if (anyRescued) {
      msg.react('🛡️').catch(() => {});
      const newTotal = Math.max(1, Math.ceil(session.stage2Pending.length / MEMBERS_PER_PAGE));
      session.stage2Page = Math.min(session.stage2Page, newTotal - 1);
      stageMsg
        .edit({
          embeds: [buildStageEmbed({ session, members: session.stage2Pending, stage: 2, page: session.stage2Page })],
          components: buildStageActionRows(session.id, 2, session.stage2Page, newTotal, session.isDryRun),
        })
        .catch(() => {});
    }
  });

  // ── Button collector ───────────────────────────────────────────────────────
  const buttonCollector = stageMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
  });

  buttonCollector.on('collect', async btn => {
    const id = btn.customId;

    if (id === `s2_prev_${session.id}`) {
      session.stage2Page = Math.max(0, session.stage2Page - 1);
      const total = Math.max(1, Math.ceil(session.stage2Pending.length / MEMBERS_PER_PAGE));
      await btn.update({
        embeds: [buildStageEmbed({ session, members: session.stage2Pending, stage: 2, page: session.stage2Page })],
        components: buildStageActionRows(session.id, 2, session.stage2Page, total, session.isDryRun),
      });
    } else if (id === `s2_next_${session.id}`) {
      const total = Math.max(1, Math.ceil(session.stage2Pending.length / MEMBERS_PER_PAGE));
      session.stage2Page = Math.min(total - 1, session.stage2Page + 1);
      await btn.update({
        embeds: [buildStageEmbed({ session, members: session.stage2Pending, stage: 2, page: session.stage2Page })],
        components: buildStageActionRows(session.id, 2, session.stage2Page, total, session.isDryRun),
      });
    } else if (id === `s2_confirm_${session.id}`) {
      buttonCollector.stop('confirmed');
      rescueCollector.stop();
      await btn.update({ components: [] });
      logger.info('Stage 2 confirmed', {
        scanId: session.id,
        pending: session.stage2Pending.length,
        rescued: session.rescuedIds.size,
      });
      await showFinalReview(interaction, session, channel);
    } else if (id === `s2_discard_${session.id}`) {
      buttonCollector.stop('discarded');
      rescueCollector.stop();
      deleteSession(session.guildId);
      await btn.update({
        embeds: [buildDiscardedEmbed(2)],
        components: [],
      });
      logger.info('Stage 2 discarded', { scanId: session.id });
    }
  });

  buttonCollector.on('end', (_, reason) => {
    if (reason === 'time') {
      rescueCollector.stop();
      deleteSession(session.guildId);
      stageMsg
        .edit({
          content: '⏰ Session expired — scan results cleared.',
          components: [],
        })
        .catch(() => {});
      logger.info('Stage 2 timed out', { scanId: session.id });
    }
  });
}
