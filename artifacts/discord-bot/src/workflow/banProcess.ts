import {
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';
import { type ScanSession, deleteSession } from './ScanSession.js';
import { buildBanProgressEmbed, buildBanCompleteEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { BAN_DELAY_MS, BAN_PROGRESS_UPDATE_EVERY } from '../config.js';
import { queries } from '../database/queries.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute bans for all members in the session's pending lists.
 * - Skips rescued members (double-check).
 * - Bans slowly to stay within Discord's rate limits.
 * - Shows a live progress embed.
 * - Handles individual ban failures gracefully without stopping the process.
 * - Writes a full log to the SQLite database when done.
 */
export async function executeBans(
  interaction: ChatInputCommandInteraction,
  session: ScanSession,
  channel: TextChannel,
): Promise<void> {
  const toban = [
    ...session.stage1Pending,
    ...session.stage2Pending,
  ].filter(r => !session.rescuedIds.has(r.member.id));

  const total = toban.length;
  let banned = 0;
  let failed = 0;
  const failedNames: string[] = [];

  logger.info('Ban process started', { scanId: session.id, total });

  // Send initial progress message
  const progressMsg = await interaction.followUp({
    embeds: [buildBanProgressEmbed({ banned, failed, total, current: 'Starting…' })],
  });

  for (let i = 0; i < toban.length; i++) {
    const result = toban[i];
    const member = result.member;

    // Safety: skip anyone marked as rescued (belt-and-suspenders)
    if (session.rescuedIds.has(member.id)) {
      logger.info('Skipping rescued member during ban', { userId: member.id, scanId: session.id });
      continue;
    }

    let banStatus: 'banned' | 'failed' = 'banned';

    try {
      await member.ban({
        reason: `[BotDetector] Confidence: ${result.score}% — ${result.reasons.join('; ')}`,
      });
      banned++;
      logger.info('Banned member', { userId: member.id, username: member.user.username, score: result.score, scanId: session.id });
    } catch (err) {
      failed++;
      failedNames.push(member.user.username);
      banStatus = 'failed';
      logger.warn('Failed to ban member', { userId: member.id, username: member.user.username, error: err, scanId: session.id });
    }

    // Log each member
    queries.insertMemberLog({
      scanId: session.id,
      guildId: session.guildId,
      userId: member.id,
      username: member.user.username,
      confidence: result.score,
      riskLevel: result.riskLevel,
      reasons: result.reasons,
      wasRescued: false,
      wasBanned: banStatus === 'banned',
      banStatus,
    });

    // Update progress embed periodically
    if ((i + 1) % BAN_PROGRESS_UPDATE_EVERY === 0 || i === toban.length - 1) {
      await progressMsg
        .edit({
          embeds: [
            buildBanProgressEmbed({
              banned,
              failed,
              total,
              current: `${member.user.username} (${member.id})`,
            }),
          ],
        })
        .catch(() => {});
    }

    // Slow down between bans to respect rate limits
    await sleep(BAN_DELAY_MS);
  }

  // Log rescued members
  for (const userId of session.rescuedIds) {
    const result = session.allResults.find(r => r.member.id === userId);
    if (result) {
      queries.insertMemberLog({
        scanId: session.id,
        guildId: session.guildId,
        userId: result.member.id,
        username: result.member.user.username,
        confidence: result.score,
        riskLevel: result.riskLevel,
        reasons: result.reasons,
        wasRescued: true,
        wasBanned: false,
        banStatus: 'not_banned',
      });
    }
  }

  // Write scan summary log
  queries.insertScanLog({
    scanId: session.id,
    guildId: session.guildId,
    isDryRun: false,
    startedAt: session.startedAt.toISOString(),
    totalScanned: session.allResults.length,
    totalHigh: session.highConfidence.length,
    totalPossible: session.possibleFake.length,
    totalBanned: banned,
    totalRescued: session.rescuedIds.size,
  });

  session.stage = 'complete';
  deleteSession(session.guildId);

  logger.info('Ban process complete', { scanId: session.id, banned, failed, rescued: session.rescuedIds.size });

  // Final summary
  await progressMsg
    .edit({
      embeds: [
        buildBanCompleteEmbed({
          banned,
          failed,
          rescued: session.rescuedIds.size,
          total,
          failedNames,
          scanId: session.id,
        }),
      ],
    })
    .catch(() => {});
}
