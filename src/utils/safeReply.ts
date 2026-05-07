import type {
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  RepliableInteraction,
} from 'discord.js';

export async function safeReply(
  interaction: RepliableInteraction,
  options: string | InteractionReplyOptions,
): Promise<void> {
  if (interaction.deferred && !interaction.replied) {
    if (typeof options === 'string') {
      await interaction.editReply(options);
      return;
    }

    const editOptions = { ...options };
    delete editOptions.ephemeral;
    delete editOptions.flags;
    await interaction.editReply(editOptions as InteractionEditReplyOptions);
    return;
  }

  if (interaction.replied) {
    await interaction.followUp(options);
    return;
  }

  await interaction.reply(options);
}
