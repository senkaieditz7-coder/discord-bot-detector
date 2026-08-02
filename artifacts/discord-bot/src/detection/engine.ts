import type { GuildMember } from 'discord.js';
import { analyzeAccountAge, type SignalResult } from './signals/accountAge.js';
import { analyzeAvatar } from './signals/avatar.js';
import { analyzeUsername } from './signals/username.js';
import {
  computeJoinWaves,
  analyzeJoinWave,
  analyzeSequentialCreation,
  type JoinWave,
} from './signals/joinPattern.js';
import { analyzeRoles } from './signals/roles.js';
import { analyzeProfileCustomization } from './signals/profileCustomization.js';
import { HIGH_CONFIDENCE_THRESHOLD, POSSIBLE_FAKE_THRESHOLD } from '../config.js';

export type RiskLevel = 'high' | 'possible' | 'clean';

export interface MemberResult {
  member: GuildMember;
  /** Clamped 0–100 confidence score */
  score: number;
  /** Non-empty reasons from fired signals, ready to display */
  reasons: string[];
  /** Raw signal breakdown for debugging/logging */
  signals: SignalResult[];
  riskLevel: RiskLevel;
}

export interface DetectionContext {
  waveMap: Map<string, JoinWave>;
  allMembers: GuildMember[];
}

/**
 * Build shared context that signals needing full-server data can use.
 * Call ONCE before iterating over members.
 */
export function buildDetectionContext(members: GuildMember[]): DetectionContext {
  return {
    waveMap: computeJoinWaves(members),
    allMembers: members,
  };
}

/**
 * Run all detection signals on a single member and return a scored result.
 * Adding a new heuristic: implement a new signal file, import it here, and
 * append the result to the `signals` array below. Nothing else needs to change.
 */
export function analyzeMember(
  member: GuildMember,
  ctx: DetectionContext,
): MemberResult {
  const signals: SignalResult[] = [
    analyzeAccountAge(member),
    analyzeAvatar(member),
    analyzeUsername(member),
    analyzeJoinWave(member, ctx.waveMap),
    analyzeSequentialCreation(member, ctx.allMembers),
    analyzeRoles(member),
    analyzeProfileCustomization(member),
  ];

  const rawScore = signals.reduce((sum, s) => sum + s.score, 0);
  const score = Math.min(rawScore, 100);

  const reasons = signals
    .filter(s => s.score > 0 && s.reason != null)
    .map(s => s.reason!);

  let riskLevel: RiskLevel;
  if (score >= HIGH_CONFIDENCE_THRESHOLD) {
    riskLevel = 'high';
  } else if (score >= POSSIBLE_FAKE_THRESHOLD) {
    riskLevel = 'possible';
  } else {
    riskLevel = 'clean';
  }

  return { member, score, reasons, signals, riskLevel };
}
