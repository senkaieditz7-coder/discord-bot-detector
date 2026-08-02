import db from './db.js';

// ── Schema initialisation ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS scan_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id       TEXT    NOT NULL,
    guild_id      TEXT    NOT NULL,
    is_dry_run    INTEGER NOT NULL DEFAULT 0,
    started_at    TEXT    NOT NULL,
    completed_at  TEXT    DEFAULT (datetime('now')),
    total_scanned INTEGER NOT NULL DEFAULT 0,
    total_high    INTEGER NOT NULL DEFAULT 0,
    total_possible INTEGER NOT NULL DEFAULT 0,
    total_banned  INTEGER NOT NULL DEFAULT 0,
    total_rescued INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS member_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id     TEXT    NOT NULL,
    guild_id    TEXT    NOT NULL,
    user_id     TEXT    NOT NULL,
    username    TEXT    NOT NULL,
    confidence  INTEGER NOT NULL,
    risk_level  TEXT    NOT NULL,
    reasons     TEXT    NOT NULL,
    was_rescued INTEGER NOT NULL DEFAULT 0,
    was_banned  INTEGER NOT NULL DEFAULT 0,
    ban_status  TEXT    NOT NULL DEFAULT 'not_banned',
    logged_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Types ────────────────────────────────────────────────────────────────────
export interface ScanLogData {
  scanId: string;
  guildId: string;
  isDryRun: boolean;
  startedAt: string;
  totalScanned: number;
  totalHigh: number;
  totalPossible: number;
  totalBanned: number;
  totalRescued: number;
}

export interface MemberLogData {
  scanId: string;
  guildId: string;
  userId: string;
  username: string;
  confidence: number;
  riskLevel: string;
  reasons: string[];
  wasRescued: boolean;
  wasBanned: boolean;
  banStatus: 'banned' | 'failed' | 'not_banned' | 'dry_run';
}

// ── Prepared statements (node:sqlite uses $name for named params) ─────────────
const insertScanLogStmt = db.prepare(`
  INSERT INTO scan_logs
    (scan_id, guild_id, is_dry_run, started_at,
     total_scanned, total_high, total_possible, total_banned, total_rescued)
  VALUES
    ($scanId, $guildId, $isDryRun, $startedAt,
     $totalScanned, $totalHigh, $totalPossible, $totalBanned, $totalRescued)
`);

const insertMemberLogStmt = db.prepare(`
  INSERT INTO member_logs
    (scan_id, guild_id, user_id, username, confidence, risk_level,
     reasons, was_rescued, was_banned, ban_status)
  VALUES
    ($scanId, $guildId, $userId, $username, $confidence, $riskLevel,
     $reasons, $wasRescued, $wasBanned, $banStatus)
`);

// ── Query functions ──────────────────────────────────────────────────────────
export const queries = {
  insertScanLog(data: ScanLogData) {
    return insertScanLogStmt.run({
      $scanId: data.scanId,
      $guildId: data.guildId,
      $isDryRun: data.isDryRun ? 1 : 0,
      $startedAt: data.startedAt,
      $totalScanned: data.totalScanned,
      $totalHigh: data.totalHigh,
      $totalPossible: data.totalPossible,
      $totalBanned: data.totalBanned,
      $totalRescued: data.totalRescued,
    });
  },

  insertMemberLog(data: MemberLogData) {
    return insertMemberLogStmt.run({
      $scanId: data.scanId,
      $guildId: data.guildId,
      $userId: data.userId,
      $username: data.username,
      $confidence: data.confidence,
      $riskLevel: data.riskLevel,
      $reasons: data.reasons.join(' | '),
      $wasRescued: data.wasRescued ? 1 : 0,
      $wasBanned: data.wasBanned ? 1 : 0,
      $banStatus: data.banStatus,
    });
  },

  /** Batch-insert member logs inside a single transaction */
  insertMemberLogsBatch(logs: MemberLogData[]) {
    // Reuse the module-level prepared statement instead of repreparing on every call
    // node:sqlite wraps in transaction via BEGIN/COMMIT manually
    db.exec('BEGIN');
    try {
      for (const data of logs) {
        insertMemberLogStmt.run({
          $scanId: data.scanId,
          $guildId: data.guildId,
          $userId: data.userId,
          $username: data.username,
          $confidence: data.confidence,
          $riskLevel: data.riskLevel,
          $reasons: data.reasons.join(' | '),
          $wasRescued: data.wasRescued ? 1 : 0,
          $wasBanned: data.wasBanned ? 1 : 0,
          $banStatus: data.banStatus,
        });
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },

  getRecentScans(guildId: string, limit = 10) {
    return db.prepare(
      `SELECT * FROM scan_logs WHERE guild_id = $guildId ORDER BY started_at DESC LIMIT $limit`,
    ).all({ $guildId: guildId, $limit: limit });
  },
};
