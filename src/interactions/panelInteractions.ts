import { MessageFlags } from 'discord.js';
import type {
  ButtonInteraction,
  GuildMember,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

import { PANEL_RENAME_INPUT_ID } from '../config/constants';
import { incrementMetricCounter } from '../db/repositories/metricsRepo';
import type { CommandExecutionContext } from '../types';
import {
  claimPanelChannel,
  PanelServiceError,
  buildPanelComponents,
  buildPanelEmbed,
  buildRenameModal,
  isPanelCustomId,
  lockPanelChannel,
  parsePanelCustomId,
  renamePanelChannel,
  resolvePanelTargetByChannelId,
  setPanelChannelUserLimit,
  unlockPanelChannel,
} from '../services/panelService';
import { safeReply } from '../utils/safeReply';

function getGuildMember(
  interaction:
    ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): GuildMember {
  return interaction.member as GuildMember;
}

function isDiscordMissingPermissionsError(
  error: unknown,
): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 50013
  );
}

async function replyPanelError(
  interaction:
    ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  message: string,
): Promise<void> {
  if (interaction.deferred && !interaction.isModalSubmit()) {
    await interaction.followUp({
      content: message,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await safeReply(interaction, {
    content: message,
    flags: MessageFlags.Ephemeral,
  });
}

export function matchesPanelInteraction(customId: string): boolean {
  return isPanelCustomId(customId);
}

export async function handlePanelInteraction(
  interaction:
    ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  context: CommandExecutionContext,
): Promise<void> {
  const parsed = parsePanelCustomId(interaction.customId);

  if (!parsed) {
    return;
  }

  const member = getGuildMember(interaction);

  try {
    if (interaction.isButton()) {
      if (parsed.action === 'rename') {
        const cachedChannel = member.guild.channels.cache.get(parsed.channelId);
        const currentName = cachedChannel?.isVoiceBased()
          ? cachedChannel.name
          : '';
        await interaction.showModal(
          buildRenameModal(parsed.channelId, currentName),
        );
        return;
      }

      await interaction.deferUpdate();
      const target = await resolvePanelTargetByChannelId(
        member,
        parsed.channelId,
      );

      if (parsed.action === 'refresh') {
        const embed = await buildPanelEmbed(target);
        await interaction.editReply({
          embeds: [embed],
          components: buildPanelComponents(target),
        });
        return;
      }

      if (parsed.action === 'claim') {
        const updatedTarget = await claimPanelChannel(target, member);
        context.logger.info({
          event: 'panel_claim_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
        });
        const embed = await buildPanelEmbed(updatedTarget);
        await interaction.editReply({
          embeds: [embed],
          components: buildPanelComponents(updatedTarget),
        });
        return;
      }

      if (parsed.action === 'lock') {
        const updatedTarget = await lockPanelChannel(target);
        incrementMetricCounter(member.guild.id, 'lock_used');
        context.logger.info({
          event: 'panel_lock_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
        });
        const embed = await buildPanelEmbed(updatedTarget);
        await interaction.editReply({
          embeds: [embed],
          components: buildPanelComponents(updatedTarget),
        });
        return;
      }

      if (parsed.action === 'unlock') {
        const updatedTarget = await unlockPanelChannel(target);
        incrementMetricCounter(member.guild.id, 'unlock_used');
        context.logger.info({
          event: 'panel_unlock_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
        });
        const embed = await buildPanelEmbed(updatedTarget);
        await interaction.editReply({
          embeds: [embed],
          components: buildPanelComponents(updatedTarget),
        });
      }

      return;
    }

    if (interaction.isStringSelectMenu() && parsed.action === 'setlimit') {
      await interaction.deferUpdate();
      const target = await resolvePanelTargetByChannelId(
        member,
        parsed.channelId,
      );
      const selectedLimit = Number(interaction.values[0]);
      const updatedTarget = await setPanelChannelUserLimit(
        target,
        selectedLimit,
        member,
      );

      incrementMetricCounter(member.guild.id, 'limit_used');
      context.logger.info({
        event: 'panel_limit_used',
        guildId: member.guild.id,
        userId: member.id,
        channelId: target.channel.id,
        userLimit: selectedLimit,
      });

      const embed = await buildPanelEmbed(updatedTarget);
      await interaction.editReply({
        embeds: [embed],
        components: buildPanelComponents(updatedTarget),
      });
      return;
    }

    if (interaction.isModalSubmit() && parsed.action === 'rename') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const target = await resolvePanelTargetByChannelId(
        member,
        parsed.channelId,
      );
      const newName = interaction.fields.getTextInputValue(
        PANEL_RENAME_INPUT_ID,
      );
      const updatedTarget = await renamePanelChannel(target, member, newName);

      incrementMetricCounter(member.guild.id, 'rename_used');
      context.logger.info({
        event: 'panel_rename_used',
        guildId: member.guild.id,
        userId: member.id,
        channelId: target.channel.id,
      });

      const embed = await buildPanelEmbed(updatedTarget);
      await interaction.editReply({
        embeds: [embed],
        components: buildPanelComponents(updatedTarget),
      });
    }
  } catch (error) {
    if (error instanceof PanelServiceError) {
      await replyPanelError(interaction, error.message);
      return;
    }

    context.logger.error(
      {
        event: 'panel_interaction_failed',
        guildId: member.guild.id,
        userId: member.id,
        customId: interaction.customId,
      },
      error,
    );

    if (isDiscordMissingPermissionsError(error)) {
      await replyPanelError(
        interaction,
        'У Pemucik не хватает прав, чтобы изменить доступ к комнате. Выдайте боту `Administrator` или права на изменение переопределений прав канала, затем попробуйте снова.',
      );
      return;
    }

    await replyPanelError(
      interaction,
      'Во время обработки действия в панели управления произошла ошибка.',
    );
  }
}
