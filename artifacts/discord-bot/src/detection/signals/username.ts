import type { GuildMember } from 'discord.js';
import type { SignalResult } from './accountAge.js';

/** Patterns commonly seen in bulk-generated bot usernames */
const BOT_PATTERNS: RegExp[] = [
  /^[a-z]{2,6}\d{4,}$/i,          // letters then 4+ digits, e.g. "user2049"
  /^\d{4,}[a-z]{2,6}$/i,          // 4+ digits then letters
  /^(?:[a-z]{1,3}\d+){3,}$/i,     // repeated letter-digit groups, e.g. "ab12cd34ef56"
  /^[a-z]\d{2}[a-z]\d{2}[a-z]/i, // alternating letter-digit, e.g. "a12b34c"
];

const CONSECUTIVE_DIGIT_RE = /\d{4,}/;          // 4 or more digits in a row
const REPEATED_CHAR_RE = /(.)\1{3,}/;           // same character repeated 4+ times

/** Shannon entropy of a string (bits per character) */
function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Signal: Suspicious Username Pattern
 * Bulk-generated accounts often share recognizable patterns: number suffixes,
 * alternating letter-digit sequences, low character diversity, etc.
 *
 * Max contribution: 20 pts
 */
export function analyzeUsername(member: GuildMember): SignalResult {
  const name = member.user.username.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  // 4+ consecutive digits
  if (CONSECUTIVE_DIGIT_RE.test(name)) {
    const m = name.match(CONSECUTIVE_DIGIT_RE)!;
    score += 8;
    reasons.push(`Username contains ${m[0].length} consecutive digits ("${m[0]}")`);
  }

  // Matches a known bot pattern
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(name)) {
      score += 10;
      reasons.push('Username matches a common bot/generated name pattern');
      break;
    }
  }

  // Repeated characters
  if (REPEATED_CHAR_RE.test(name)) {
    score += 4;
    reasons.push('Username contains a repeated character sequence');
  }

  // Low Shannon entropy (very little character variety)
  if (name.length >= 6 && entropy(name) < 2.5) {
    score += 6;
    reasons.push('Username has unusually low character diversity (possible generated string)');
  }

  // Long alphanumeric blob with no separators
  if (/^[a-z0-9]{14,}$/i.test(name)) {
    score += 4;
    reasons.push('Username is an unusually long run of alphanumerics with no separators');
  }

  score = Math.min(score, 20);

  return {
    name: 'Username Pattern',
    score,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}
