import type { GuildMember } from 'discord.js';
import type { SignalResult } from './accountAge.js';

/**
 * Signal: Profile Customization
 * Real users typically customize their profiles (global name, banner, bio).
 * Bulk-generated bots almost never do.
 *
 * Note: banner/bio fetch requires a separate API call (fetchProfile) which is
 * rate-limited; we use what is already available on the cached user object.
 *
 * Max contribution: 8 pts
 */
export function analyzeProfileCustomization(member: GuildMember): SignalResult {
  const user = member.user;
  const reasons: string[] = [];
  let score = 0;

  // No profile banner
  if (!user.banner) {
    score += 3;
    reasons.push('No profile banner');
  }

  // No global display name (still on legacy username system)
  // globalName is null for users who haven't set a display name yet
  if (!user.globalName) {
    score += 5;
    reasons.push('No display name set (legacy username-only account)');
  }

  score = Math.min(score, 8);

  return {
    name: 'Profile Customization',
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}
