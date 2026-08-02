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
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.GuildMember, Partials.User],
});
