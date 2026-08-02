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
import { showStage2 } from './stage2.js';

export async function showStage1(
  interaction: ChatInputCommandInteraction,
  session: ScanSession,
  channel: TextChannel,
): Promise<void> {
  session.stage = 'stage1';
  session.stage1Page = 0;

  if (session.stage1Pending.length === 0) {
    await interaction.followUp({
      embeds: [buildNoMembersStageEmbed(1, session.isDryRun)],
    });
    await showStage2(interaction, session, channel);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(session.stage1Pending.length / MEMBERS_PER_PAGE));

  // Send Stage 1 results message
  const stageMsg = await interaction.followUp({
    embeds: [buildStageEmbed({ session, members: session.stage1Pending, stage: 1, page: 0 })],
    components: buildStageActionRows(session.id, 1, 0, totalPages, session.isDryRun),
  });

  // ── Rescue listener ────────────────────────────────────────────────────────
  // Collect messages that mention members while Stage 1 is active
  const rescueCollector = channel.createMessageCollector({
    filter: msg => msg.author.id === interaction.user.id,
    time: INTERACTION_TIMEOUT_MS,
  });

  rescueCollector.on('collect', msg => {
    let anyRescued = false;
    for (const [userId] of msg.mentions.users) {
      if (rescueMember(session, userId)) {
        anyRescued = true;
        logger.info('Member rescued via mention', { userId, stage: 1, scanId: session.id });
      }
    }
    if (anyRescued) {
      // React to acknowledge the rescue
      msg.react('🛡️').catch(() => {});
      // Update the embed to reflect the new pending list
      const newTotal = Math.max(1, Math.ceil(session.stage1Pending.length / MEMBERS_PER_PAGE));
      session.stage1Page = Math.min(session.stage1Page, newTotal - 1);
      stageMsg
        .edit({
          embeds: [buildStageEmbed({ session, members: session.stage1Pending, stage: 1, page: session.stage1Page })],
          components: buildStageActionRows(session.id, 1, session.stage1Page, newTotal, session.isDryRun),
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

    if (id === `s1_prev_${session.id}`) {
      session.stage1Page = Math.max(0, session.stage1Page - 1);
      const total = Math.max(1, Math.ceil(session.stage1Pending.length / MEMBERS_PER_PAGE));
      await btn.update({
        embeds: [buildStageEmbed({ session, members: session.stage1Pending, stage: 1, page: session.stage1Page })],
        components: buildStageActionRows(session.id, 1, session.stage1Page, total, session.isDryRun),
      });
    } else if (id === `s1_next_${session.id}`) {
      const total = Math.max(1, Math.ceil(session.stage1Pending.length / MEMBERS_PER_PAGE));
      session.stage1Page = Math.min(total - 1, session.stage1Page + 1);
      await btn.update({
        embeds: [buildStageEmbed({ session, members: session.stage1Pending, stage: 1, page: session.stage1Page })],
        components: buildStageActionRows(session.id, 1, session.stage1Page, total, session.isDryRun),
      });
    } else if (id === `s1_confirm_${session.id}`) {
      buttonCollector.stop('confirmed');
      rescueCollector.stop();
      await btn.update({ components: [] });
      logger.info('Stage 1 confirmed', {
        scanId: session.id,
        pending: session.stage1Pending.length,
        rescued: session.rescuedIds.size,
      });
      await showStage2(interaction, session, channel);
    } else if (id === `s1_discard_${session.id}`) {
      buttonCollector.stop('discarded');
      rescueCollector.stop();
      deleteSession(session.guildId);
      await btn.update({
        embeds: [buildDiscardedEmbed(1)],
        components: [],
      });
      logger.info('Stage 1 discarded', { scanId: session.id });
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
      logger.info('Stage 1 timed out', { scanId: session.id });
    }
  });
}
