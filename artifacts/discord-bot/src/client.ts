import { Client, GatewayIntentBits, Partials } from 'discord.js';

/**
 * Singleton Discord client with all intents required for member analysis.
 * - GuildMembers: fetch the full member list (requires privileged intent)
 * - GuildMessages + MessageContent: read messages for rescue mentions
 * - GuildPresences: read online status / activity
 * - GuildVoiceStates: detect voice activity
 */
export const client = new Client({
  intents: [
    // Standard intents (no approval needed)
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,

    // ── Privileged intents ─────────────────────────────────────────────────
    // These MUST be enabled in Discord Developer Portal →
    //   Applications → [Your App] → Bot → Privileged Gateway Intents
    //
    // 1. GuildMembers  → "Server Members Intent"  (required: fetch all members)
    // 2. MessageContent → "Message Content Intent" (required: rescue-mention system)
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.GuildMember, Partials.User],
});
