import type { GuildMember } from 'discord.js';

export interface SignalResult {
  name: string;
  /** Contribution to the overall confidence score (0-based, additive) */
  score: number;
  /** Human-readable reason shown in embeds. null = signal did not fire */
  reason: string | null;
}

/**
 * Signal: Account Age
 * Very new accounts are a strong bot indicator — especially for raid accounts
 * created in bulk moments before joining.
 *
 * Max contribution: 30 pts
 */
export function analyzeAccountAge(member: GuildMember): SignalResult {
  const ageMs = Date.now() - member.user.createdTimestamp;
  const ageDays = ageMs / 86_400_000;

  if (ageDays < 1) {
    const hours = (ageDays * 24).toFixed(1);
    return { name: 'Account Age', score: 30, reason: `Account created only ${hours}h ago (< 1 day old)` };
  }
  if (ageDays < 7) {
    return { name: 'Account Age', score: 22, reason: `Account only ${ageDays.toFixed(1)} days old (< 1 week)` };
  }
  if (ageDays < 30) {
    return { name: 'Account Age', score: 12, reason: `Account only ${ageDays.toFixed(0)} days old (< 1 month)` };
  }
  if (ageDays < 90) {
    return { name: 'Account Age', score: 4, reason: `Account ${ageDays.toFixed(0)} days old (relatively new, < 3 months)` };
  }

  return { name: 'Account Age', score: 0, reason: null };
}
