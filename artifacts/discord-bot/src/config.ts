/** The only Discord user ID allowed to run bot commands */
export const OWNER_ID = '1472802482152542410' as const;

// ── Scoring thresholds (0–100 scale) ─────────────────────────────────────────
/** Score at or above this → High Confidence (Stage 1) */
export const HIGH_CONFIDENCE_THRESHOLD = 65;
/** Score at or above this → Possible Fake (Stage 2) */
export const POSSIBLE_FAKE_THRESHOLD = 35;

// ── Timing ────────────────────────────────────────────────────────────────────
/** Milliseconds to wait between each ban to respect Discord rate limits */
export const BAN_DELAY_MS = 1500;
/** How many members are scanned between progress embed updates */
export const PROGRESS_UPDATE_EVERY = 15;

// ── Display ───────────────────────────────────────────────────────────────────
/** Members shown per page in Stage 1 / Stage 2 result embeds */
export const MEMBERS_PER_PAGE = 8;
/** How many bans are shown between ban-progress embed updates */
export const BAN_PROGRESS_UPDATE_EVERY = 5;

// ── Session timeouts ─────────────────────────────────────────────────────────
/** How long (ms) to wait for a button click before cancelling the workflow */
export const INTERACTION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
