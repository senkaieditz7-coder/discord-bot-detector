import type { GuildMember } from 'discord.js';
import type { SignalResult } from './accountAge.js';

/**
 * Signal: No Roles
 * Real active members tend to accumulate roles over time (verified, levels,
 * reactions, etc.). A member with no roles at all beyond @everyone is slightly
 * suspicious, especially when combined with other signals.
 *
 * Max contribution: 5 pts
 */
export function analyzeRoles(member: GuildMember): SignalResult {
  // cache.size === 1 means only @everyone (which every member has)
  const hasOnlyEveryone = member.roles.cache.size <= 1;

  return {
    name: 'No Roles',
    score: hasOnlyEveryone ? 5 : 0,
    reason: hasOnlyEveryone ? 'Member has no roles assigned beyond @everyone' : null,
  };
}
