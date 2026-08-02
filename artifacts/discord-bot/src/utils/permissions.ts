import type { CommandInteraction, ButtonInteraction } from 'discord.js';
import { OWNER_ID } from '../config.js';

/** Returns true if the given user ID matches the configured owner */
export function isOwner(userId: string): boolean {
  return userId === OWNER_ID;
}

/**
 * Guards a slash-command interaction: replies with an error and returns false
 * if the caller is not the owner. Returns true if the caller is allowed.
 */
export async function requireOwner(
  interaction: CommandInteraction,
): Promise<boolean> {
  if (isOwner(interaction.user.id)) return true;
  await interaction.reply({
    content: '⛔ This command is restricted to the bot owner.',
    ephemeral: true,
  });
  return false;
}
