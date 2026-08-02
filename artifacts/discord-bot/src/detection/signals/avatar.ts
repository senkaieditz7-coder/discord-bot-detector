import type { GuildMember } from 'discord.js';
import type { SignalResult } from './accountAge.js';

/**
 * Signal: Default / No Avatar
 * Bots created in bulk rarely have custom avatars set.
 *
 * Max contribution: 15 pts
 */
export function analyzeAvatar(member: GuildMember): SignalResult {
  // member.avatar is the server-specific avatar; user.avatar is the global one
  const hasCustomAvatar = !!(member.avatar ?? member.user.avatar);

  if (!hasCustomAvatar) {
    return {
      name: 'Default Avatar',
      score: 15,
      reason: 'No custom avatar — using a default Discord avatar',
    };
  }

  return { name: 'Default Avatar', score: 0, reason: null };
}
