import type { GuildMember } from 'discord.js';
import type { MemberResult } from '../detection/engine.js';

export type ScanStage =
  | 'scanning'
  | 'stage1'
  | 'stage2'
  | 'finalReview'
  | 'confirming2'
  | 'confirming3'
  | 'banning'
  | 'complete'
  | 'cancelled';

export interface ScanSession {
  id: string;
  guildId: string;
  channelId: string;
  isDryRun: boolean;
  stage: ScanStage;

  // Full detection results
  allResults: MemberResult[];
  highConfidence: MemberResult[];
  possibleFake: MemberResult[];

  // Per-stage pending lists (shrink as members are rescued)
  stage1Pending: MemberResult[];
  stage2Pending: MemberResult[];

  // IDs of members the owner has rescued
  rescuedIds: Set<string>;

  // Pagination state for display embeds
  stage1Page: number;
  stage2Page: number;

  // When the scan started
  startedAt: Date;
}

// One active session per guild at most
const sessions = new Map<string, ScanSession>();

export function createSession(
  guildId: string,
  channelId: string,
  isDryRun: boolean,
): ScanSession {
  const session: ScanSession = {
    id: Math.random().toString(36).slice(2, 10),
    guildId,
    channelId,
    isDryRun,
    stage: 'scanning',
    allResults: [],
    highConfidence: [],
    possibleFake: [],
    stage1Pending: [],
    stage2Pending: [],
    rescuedIds: new Set(),
    stage1Page: 0,
    stage2Page: 0,
    startedAt: new Date(),
  };
  sessions.set(guildId, session);
  return session;
}

export function getSession(guildId: string): ScanSession | undefined {
  return sessions.get(guildId);
}

export function deleteSession(guildId: string): void {
  sessions.delete(guildId);
}

export function hasActiveSession(guildId: string): boolean {
  const s = sessions.get(guildId);
  return s != null && s.stage !== 'complete' && s.stage !== 'cancelled';
}

/**
 * Attempt to rescue a member by ID.
 * Removes them from both pending lists and records their ID.
 * Returns true if they were actually in a pending list.
 */
export function rescueMember(session: ScanSession, userId: string): boolean {
  if (session.rescuedIds.has(userId)) return false;

  const inStage1 = session.stage1Pending.some(r => r.member.id === userId);
  const inStage2 = session.stage2Pending.some(r => r.member.id === userId);

  if (!inStage1 && !inStage2) return false;

  session.rescuedIds.add(userId);
  session.stage1Pending = session.stage1Pending.filter(r => r.member.id !== userId);
  session.stage2Pending = session.stage2Pending.filter(r => r.member.id !== userId);
  return true;
}
