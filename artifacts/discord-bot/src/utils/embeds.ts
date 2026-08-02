import {
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type APIEmbed,
} from 'discord.js';
import type { MemberResult } from '../detection/engine.js';
import type { ScanSession } from '../workflow/ScanSession.js';
import { MEMBERS_PER_PAGE } from '../config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskEmoji(score: number): string {
  if (score >= 80) return '🔴';
  if (score >= 65) return '🟠';
  if (score >= 35) return '🟡';
  return '🟢';
}

function confidenceBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function formatMemberEntry(r: MemberResult, index: number): string {
  const emoji = riskEmoji(r.score);
  const bar = confidenceBar(r.score);
  const tag = `**${r.member.user.username}** (<@${r.member.id}>)`;
  const id = `\`ID: ${r.member.id}\``;
  const confidence = `${emoji} **${r.score}%** \`${bar}\``;
  const reasonList = r.reasons.length
    ? r.reasons.map(rsn => `  • ${rsn}`).join('\n')
    : '  • No specific pattern matched (low-signal)';

  return `**${index}.** ${tag}\n${id} — ${confidence}\n${reasonList}`;
}

function buildPagedDescription(
  members: MemberResult[],
  page: number,
): { description: string; pageInfo: string } {
  const totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * MEMBERS_PER_PAGE;
  const slice = members.slice(start, start + MEMBERS_PER_PAGE);

  const description = slice
    .map((r, i) => formatMemberEntry(r, start + i + 1))
    .join('\n\n');

  const pageInfo = `Page ${safePage + 1} of ${totalPages}`;
  return { description, pageInfo };
}

// ── Stage action rows ─────────────────────────────────────────────────────────

export function buildStageActionRows(
  sessionId: string,
  stage: 1 | 2,
  currentPage: number,
  totalPages: number,
  isDryRun: boolean,
) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const p = `s${stage}`;

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${p}_prev_${sessionId}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`${p}_next_${sessionId}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage >= totalPages - 1),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${p}_confirm_${sessionId}`)
        .setLabel(isDryRun ? '✅ Continue (Dry Run)' : '✅ Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${p}_discard_${sessionId}`)
        .setLabel('❌ Discard Results')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  return rows;
}

// ── Public embed builders ─────────────────────────────────────────────────────

export function buildProgressEmbed(opts: {
  isDryRun: boolean;
  scanned: number;
  total: number;
  highConfidence: number;
  possibleFake: number;
  estimatedSecondsRemaining: number | null;
}): EmbedBuilder {
  const pct = opts.total > 0 ? Math.round((opts.scanned / opts.total) * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
  const eta = opts.estimatedSecondsRemaining != null
    ? opts.estimatedSecondsRemaining < 60
      ? `~${opts.estimatedSecondsRemaining}s`
      : `~${Math.ceil(opts.estimatedSecondsRemaining / 60)}m`
    : 'Calculating…';

  const title = opts.isDryRun ? '🔍 Dry Run Scan in Progress…' : '🔍 Scan in Progress…';

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(opts.isDryRun ? Colors.Blue : Colors.Orange)
    .setDescription(`\`[${bar}]\` **${pct}%**`)
    .addFields(
      { name: 'Scanned', value: `${opts.scanned} / ${opts.total}`, inline: true },
      { name: 'ETA', value: eta, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🔴 High Confidence', value: String(opts.highConfidence), inline: true },
      { name: '🟡 Possible Fake', value: String(opts.possibleFake), inline: true },
      { name: '🟢 Clean', value: String(opts.scanned - opts.highConfidence - opts.possibleFake), inline: true },
    )
    .setFooter({ text: 'Analysing signals for each member — please wait…' })
    .setTimestamp();
}

export function buildStageEmbed(opts: {
  session: ScanSession;
  members: MemberResult[];
  stage: 1 | 2;
  page: number;
}): EmbedBuilder {
  const { session, members, stage, page } = opts;
  const totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PER_PAGE));
  const { description, pageInfo } = buildPagedDescription(members, page);

  const stageLabel = stage === 1 ? 'High Confidence Fake' : 'Possible Fake';
  const stageEmoji = stage === 1 ? '🔴' : '🟡';
  const dryTag = session.isDryRun ? ' [DRY RUN]' : '';
  const rescuedNote = session.rescuedIds.size > 0
    ? `\n\n🛡️ **${session.rescuedIds.size} member(s) rescued** — mention any member to rescue them before confirming.`
    : '\n\n💡 **Rescue system active** — mention any member in this channel to remove them from this list.';

  return new EmbedBuilder()
    .setTitle(`${stageEmoji} Stage ${stage}: ${stageLabel} Members${dryTag}`)
    .setDescription(
      members.length === 0
        ? '✅ No members in this category.'
        : description + rescuedNote,
    )
    .setColor(stage === 1 ? Colors.Red : Colors.Yellow)
    .setFooter({ text: `${members.length} member(s) total — ${pageInfo}` })
    .setTimestamp();
}

export function buildFinalReviewEmbed(session: ScanSession): EmbedBuilder {
  const s1Count = session.stage1Pending.length;
  const s2Count = session.stage2Pending.length;
  const total = s1Count + s2Count;
  const rescued = session.rescuedIds.size;
  const dryTag = session.isDryRun ? ' [DRY RUN]' : '';

  return new EmbedBuilder()
    .setTitle(`⚠️ Final Review${dryTag}`)
    .setDescription(
      session.isDryRun
        ? `This is a **dry run**. No members will be banned. The following shows exactly what *would* happen in a real scan.`
        : `Review the totals carefully, then choose an action from the dropdown below.`,
    )
    .setColor(Colors.Gold)
    .addFields(
      { name: '🔴 High Confidence Members', value: String(s1Count), inline: true },
      { name: '🟡 Suspicious Members', value: String(s2Count), inline: true },
      { name: '🛡️ Rescued Members', value: String(rescued), inline: true },
      { name: '⛔ Total Pending Ban', value: `**${total}**`, inline: false },
    )
    .setFooter({
      text: session.isDryRun
        ? 'Dry run complete — choose an action below.'
        : 'No bans have been executed yet. Select an action from the dropdown.',
    })
    .setTimestamp();
}


export function buildBanProgressEmbed(opts: {
  banned: number;
  failed: number;
  total: number;
  current: string;
}): EmbedBuilder {
  const done = opts.banned + opts.failed;
  const pct = opts.total > 0 ? Math.round((done / opts.total) * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));

  return new EmbedBuilder()
    .setTitle('⛔ Banning in Progress…')
    .setColor(Colors.DarkRed)
    .setDescription(`\`[${bar}]\` **${pct}%** — ${done}/${opts.total}`)
    .addFields(
      { name: '✅ Banned', value: String(opts.banned), inline: true },
      { name: '❌ Failed', value: String(opts.failed), inline: true },
      { name: 'Current', value: opts.current, inline: false },
    )
    .setFooter({ text: 'Banning slowly to respect Discord rate limits…' })
    .setTimestamp();
}

export function buildBanCompleteEmbed(opts: {
  banned: number;
  failed: number;
  rescued: number;
  total: number;
  failedNames: string[];
  scanId: string;
}): EmbedBuilder {
  const failedList =
    opts.failedNames.length > 0
      ? opts.failedNames.slice(0, 10).join(', ') +
        (opts.failedNames.length > 10 ? ` (+${opts.failedNames.length - 10} more)` : '')
      : 'None';

  return new EmbedBuilder()
    .setTitle('✅ Ban Process Complete')
    .setColor(Colors.DarkGreen)
    .addFields(
      { name: '⛔ Successfully Banned', value: String(opts.banned), inline: true },
      { name: '❌ Failed', value: String(opts.failed), inline: true },
      { name: '🛡️ Rescued (skipped)', value: String(opts.rescued), inline: true },
      { name: 'Failed Users', value: failedList, inline: false },
    )
    .setFooter({ text: `Scan ID: ${opts.scanId} — Full log saved to disk.` })
    .setTimestamp();
}

export function buildDryRunCompleteEmbed(opts: {
  wouldBanHigh: number;
  wouldBanPossible: number;
  rescued: number;
  scanId: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🔍 Dry Run Complete — No Action Taken')
    .setColor(Colors.Blue)
    .setDescription(
      'This was a dry run. Zero members were banned, kicked, or modified.\nReview the numbers below to decide whether to run a real scan.',
    )
    .addFields(
      { name: '🔴 Would Ban (High Confidence)', value: String(opts.wouldBanHigh), inline: true },
      { name: '🟡 Would Ban (Suspicious)', value: String(opts.wouldBanPossible), inline: true },
      { name: '🛡️ Would Skip (Rescued)', value: String(opts.rescued), inline: true },
      {
        name: '⛔ Total Would-Be Bans',
        value: `**${opts.wouldBanHigh + opts.wouldBanPossible}**`,
        inline: false,
      },
    )
    .setFooter({ text: `Scan ID: ${opts.scanId} — Full log saved to disk.` })
    .setTimestamp();
}

export function buildDiscardedEmbed(stage: 1 | 2): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🗑️ Scan Results Discarded')
    .setDescription(`Stage ${stage} results were discarded. No members were banned.`)
    .setColor(Colors.Grey)
    .setTimestamp();
}

export function buildCancelledEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🚫 Scan Cancelled')
    .setDescription('The ban process was cancelled. No members were banned.')
    .setColor(Colors.Grey)
    .setTimestamp();
}

export function buildNoMembersStageEmbed(stage: 1 | 2, isDryRun: boolean): EmbedBuilder {
  const label = stage === 1 ? 'high-confidence fake' : 'suspicious';
  return new EmbedBuilder()
    .setTitle(`✅ No ${stage === 1 ? 'High Confidence' : 'Suspicious'} Members${isDryRun ? ' [DRY RUN]' : ''}`)
    .setDescription(`No ${label} members were found. Moving to the next stage.`)
    .setColor(Colors.Green)
    .setTimestamp();
}

// ── Final review dropdown ─────────────────────────────────────────────────────

export function buildFinalSelectRow(
  sessionId: string,
  isDryRun: boolean,
  totalPending: number,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`final_select_${sessionId}`)
    .setPlaceholder('Choose an action…')
    .addOptions(
      isDryRun
        ? new StringSelectMenuOptionBuilder()
            .setValue('dry_run_finish')
            .setLabel('Finish Dry Run')
            .setDescription('End the simulation — no members will be banned.')
            .setEmoji('✅')
        : new StringSelectMenuOptionBuilder()
            .setValue('ban_confirm')
            .setLabel(`Ban ${totalPending} member(s) — I understand this is permanent`)
            .setDescription('This cannot be undone. All flagged members will be banned.')
            .setEmoji('⛔'),
      new StringSelectMenuOptionBuilder()
        .setValue('cancel')
        .setLabel('Cancel — do not ban anyone')
        .setDescription('Abort the scan. No members will be affected.')
        .setEmoji('🚫'),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}
