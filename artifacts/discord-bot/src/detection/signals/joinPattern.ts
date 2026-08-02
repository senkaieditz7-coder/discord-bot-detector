import type { GuildMember } from 'discord.js';
import type { SignalResult } from './accountAge.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface JoinWave {
  windowStartMs: number;
  windowEndMs: number;
  size: number;
  memberIds: Set<string>;
}

/**
 * Pre-compute join waves from the full member list.
 * A wave = 5 or more members whose join timestamps fall within a 1-hour window.
 * Returns a map of memberId → the largest wave they belong to.
 *
 * This must be called ONCE before individual member analysis.
 */
export function computeJoinWaves(members: GuildMember[]): Map<string, JoinWave> {
  const result = new Map<string, JoinWave>();

  const sorted = members
    .filter(m => m.joinedTimestamp != null)
    .sort((a, b) => a.joinedTimestamp! - b.joinedTimestamp!);

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = sorted[i].joinedTimestamp!;
    const windowEnd = windowStart + ONE_HOUR_MS;

    // Collect all members that fit in this window
    const wave: GuildMember[] = [];
    for (let j = i; j < sorted.length && sorted[j].joinedTimestamp! <= windowEnd; j++) {
      wave.push(sorted[j]);
    }

    if (wave.length < 5) continue;

    const memberIds = new Set(wave.map(m => m.id));
    const waveInfo: JoinWave = { windowStartMs: windowStart, windowEndMs: windowEnd, size: wave.length, memberIds };

    // Each member is assigned to the largest wave they appear in
    for (const m of wave) {
      const existing = result.get(m.id);
      if (!existing || existing.size < wave.length) {
        result.set(m.id, waveInfo);
      }
    }
  }

  return result;
}

/**
 * Signal: Join Wave
 * Being part of a large burst of joins is a strong raid indicator.
 *
 * Max contribution: 25 pts
 */
export function analyzeJoinWave(
  member: GuildMember,
  waveMap: Map<string, JoinWave>,
): SignalResult {
  const wave = waveMap.get(member.id);
  if (!wave) return { name: 'Join Wave', score: 0, reason: null };

  let score: number;
  if (wave.size >= 20) {
    score = 25;
  } else if (wave.size >= 10) {
    score = 20;
  } else {
    score = 15;
  }

  return {
    name: 'Join Wave',
    score,
    reason: `Joined in a wave of ${wave.size} accounts within a 1-hour window`,
  };
}

/**
 * Signal: Sequential Account Creation
 * Accounts created within seconds of each other and joining together are
 * a hallmark of bulk-generated bot armies.
 *
 * Max contribution: 15 pts
 */
export function analyzeSequentialCreation(
  member: GuildMember,
  allMembers: GuildMember[],
): SignalResult {
  if (!member.joinedTimestamp) return { name: 'Sequential Creation', score: 0, reason: null };

  // Find members who joined within 5 minutes of this member
  const nearby = allMembers.filter(
    m =>
      m.id !== member.id &&
      m.joinedTimestamp != null &&
      Math.abs(m.joinedTimestamp - member.joinedTimestamp!) < 5 * 60 * 1000,
  );

  if (nearby.length < 2) return { name: 'Sequential Creation', score: 0, reason: null };

  // Check whether account creation times are suspiciously close (< 60 s apart)
  const times = [member, ...nearby].map(m => m.user.createdTimestamp).sort((a, b) => a - b);
  let closePairs = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] < 60_000) closePairs++;
  }

  if (closePairs >= 2) {
    return {
      name: 'Sequential Creation',
      score: 15,
      reason: `Account was created within seconds of ${nearby.length} other accounts that joined at the same time`,
    };
  }

  return { name: 'Sequential Creation', score: 0, reason: null };
}
