import type {
  ButtonInteraction,
  GuildMember,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

import {
  INTERFACE_DELETE_CANCEL_ID,
  INTERFACE_DELETE_CONFIRM_ID,
  INTERFACE_LIMIT_INPUT_ID,
  INTERFACE_MEMBER_INPUT_ID,
  INTERFACE_REGION_SELECT_ID,
  PANEL_RENAME_INPUT_ID,
} from '../config/constants';
import type { CommandExecutionContext } from '../types';
import {
  buildDeleteConfirmationReply,
  buildLimitInterfaceModal,
  buildMemberActionModal,
  buildRegionSelectionReply,
  buildRenameInterfaceModal,
  InterfacePanelError,
  matchesPersistentInterfaceInteraction as matchesInterfaceCustomId,
  parsePersistentInterfaceAction,
  parsePersistentInterfaceModalAction,
  resolveGuildMemberFromInput,
  resolvePersistentInterfaceTarget,
} from '../services/interfacePanelService';
import {
  claimPanelChannel,
  lockPanelChannel,
  PanelServiceError,
  renamePanelChannel,
  setPanelChannelUserLimit,
  unlockPanelChannel,
} from '../services/panelService';
import {
  createVoiceChannelInvite,
  deleteVoiceChannel,
  kickVoiceMember,
  permitVoiceAccess,
  rejectVoiceAccess,
  removeVoiceAccessPermit,
  setVoiceChannelRegion,
  transferVoiceChannelOwnership,
  unbanVoiceAccess,
  VoiceControlServiceError,
} from '../services/voiceControlService';
import { safeReply } from '../utils/safeReply';

function getGuildMember(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): GuildMember {
  return interaction.member as GuildMember;
}

async function replyKnownError(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  error: PanelServiceError | VoiceControlServiceError | InterfacePanelError,
): Promise<void> {
  await safeReply(interaction, {
    content: error.message,
    ephemeral: true,
  });
}

export function matchesPersistentInterfaceInteraction(customId: string): boolean {
  return matchesInterfaceCustomId(customId);
}

export async function handlePersistentInterfaceInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  context: CommandExecutionContext,
): Promise<void> {
  const member = getGuildMember(interaction);

  try {
    if (interaction.isButton()) {
      if (interaction.customId === INTERFACE_DELETE_CANCEL_ID) {
        await interaction.update({
          content: 'Удаление комнаты отменено.',
          components: [],
        });
        return;
      }

      if (interaction.customId === INTERFACE_DELETE_CONFIRM_ID) {
        await interaction.deferReply({ ephemeral: true });
        const target = await resolvePersistentInterfaceTarget(member);
        await deleteVoiceChannel(target, member);

        context.logger.info({
          event: 'persistent_interface_delete_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
        });

        await safeReply(interaction, {
          content: 'Временная комната удалена и убрана из базы XenoVoice.',
          ephemeral: true,
        });
        return;
      }

      const action = parsePersistentInterfaceAction(interaction.customId);

      if (!action) {
        return;
      }

      const target = await resolvePersistentInterfaceTarget(member);

      if (action === 'rename') {
        await interaction.showModal(buildRenameInterfaceModal(target.channel.name));
        return;
      }

      if (action === 'limit') {
        await interaction.showModal(buildLimitInterfaceModal(target.channel.userLimit));
        return;
      }

      if (
        action === 'permit'
        || action === 'remove_permit'
        || action === 'invite'
        || action === 'kick'
        || action === 'ban'
        || action === 'unban'
        || action === 'transfer'
      ) {
        await interaction.showModal(buildMemberActionModal(action));
        return;
      }

      if (action === 'region') {
        await interaction.reply(buildRegionSelectionReply(target));
        return;
      }

      if (action === 'delete') {
        await interaction.reply(buildDeleteConfirmationReply(target));
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      if (action === 'toggle_access') {
        const updatedTarget = target.record.isLocked
          ? await unlockPanelChannel(target)
          : await lockPanelChannel(target);

        context.logger.info({
          event: 'persistent_interface_toggle_access_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: updatedTarget.channel.id,
          isLocked: updatedTarget.record.isLocked,
        });

        await safeReply(interaction, {
          content: updatedTarget.record.isLocked
            ? `Комната <#${updatedTarget.channel.id}> закрыта для новых подключений.`
            : `Комната <#${updatedTarget.channel.id}> снова открыта для новых подключений.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'claim') {
        const updatedTarget = await claimPanelChannel(target, member);

        context.logger.info({
          event: 'persistent_interface_claim_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: `Владение комнатой <#${updatedTarget.channel.id}> передано вам.`,
          ephemeral: true,
        });
      }

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === INTERFACE_REGION_SELECT_ID) {
      const target = await resolvePersistentInterfaceTarget(member);
      const value = interaction.values[0] ?? 'auto';
      const updatedTarget = await setVoiceChannelRegion(target, member, value);

      context.logger.info({
        event: 'persistent_interface_region_used',
        guildId: member.guild.id,
        userId: member.id,
        channelId: updatedTarget.channel.id,
        region: value,
      });

      await interaction.update({
        content: `Регион комнаты <#${updatedTarget.channel.id}> обновлён: **${updatedTarget.channel.rtcRegion ?? 'Авто'}**.`,
        components: [],
      });
      return;
    }

    if (interaction.isModalSubmit()) {
      const action = parsePersistentInterfaceModalAction(interaction.customId);

      if (!action) {
        return;
      }

      const target = await resolvePersistentInterfaceTarget(member);

      if (action === 'rename') {
        const newName = interaction.fields.getTextInputValue(PANEL_RENAME_INPUT_ID);
        const updatedTarget = await renamePanelChannel(target, member, newName);

        context.logger.info({
          event: 'persistent_interface_rename_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: `Название комнаты обновлено: **${updatedTarget.channel.name}**.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'limit') {
        const rawValue = interaction.fields.getTextInputValue(INTERFACE_LIMIT_INPUT_ID).trim();
        const limit = Number(rawValue);
        const updatedTarget = await setPanelChannelUserLimit(target, limit, member);

        context.logger.info({
          event: 'persistent_interface_limit_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: updatedTarget.channel.id,
          userLimit: limit,
        });

        await safeReply(interaction, {
          content: `Лимит комнаты обновлён: **${updatedTarget.channel.userLimit || 'без лимита'}**.`,
          ephemeral: true,
        });
        return;
      }

      const targetInput = interaction.fields.getTextInputValue(INTERFACE_MEMBER_INPUT_ID);
      const targetMember = await resolveGuildMemberFromInput(member.guild, targetInput);

      if (action === 'permit') {
        await permitVoiceAccess(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_permit_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
          targetUserId: targetMember.id,
        });

        await safeReply(interaction, {
          content: `Участник <@${targetMember.id}> добавлен в whitelist комнаты <#${target.channel.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'remove_permit') {
        await removeVoiceAccessPermit(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_remove_permit_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
          targetUserId: targetMember.id,
        });

        await safeReply(interaction, {
          content: `Явный whitelist для <@${targetMember.id}> убран из комнаты <#${target.channel.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'invite') {
        const result = await createVoiceChannelInvite(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_invite_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
          targetUserId: targetMember.id,
          deliveredViaDm: result.deliveredViaDm,
        });

        await safeReply(interaction, {
          content: result.deliveredViaDm
            ? `Инвайт в комнату <#${target.channel.id}> отправлен участнику <@${targetMember.id}> в личные сообщения.`
            : `Инвайт создан, но личные сообщения <@${targetMember.id}> закрыты. Используйте ссылку вручную: ${result.inviteUrl}`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'kick') {
        await kickVoiceMember(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_kick_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
          targetUserId: targetMember.id,
        });

        await safeReply(interaction, {
          content: `Участник <@${targetMember.id}> отключён от комнаты <#${target.channel.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'ban') {
        await rejectVoiceAccess(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_ban_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
          targetUserId: targetMember.id,
        });

        await safeReply(interaction, {
          content: `Участник <@${targetMember.id}> заблокирован для комнаты <#${target.channel.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'unban') {
        await unbanVoiceAccess(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_unban_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: target.channel.id,
          targetUserId: targetMember.id,
        });

        await safeReply(interaction, {
          content: `Блокировка для <@${targetMember.id}> снята в комнате <#${target.channel.id}>.`,
          ephemeral: true,
        });
        return;
      }

      if (action === 'transfer') {
        const updatedTarget = await transferVoiceChannelOwnership(target, member, targetMember);
        context.logger.info({
          event: 'persistent_interface_transfer_used',
          guildId: member.guild.id,
          userId: member.id,
          channelId: updatedTarget.channel.id,
          targetUserId: targetMember.id,
        });

        await safeReply(interaction, {
          content: `Владение комнатой <#${updatedTarget.channel.id}> передано участнику <@${targetMember.id}>.`,
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    if (
      error instanceof PanelServiceError
      || error instanceof VoiceControlServiceError
      || error instanceof InterfacePanelError
    ) {
      await replyKnownError(interaction, error);
      return;
    }

    context.logger.error({
      event: 'persistent_interface_interaction_failed',
      guildId: member.guild.id,
      userId: member.id,
      customId: interaction.customId,
    }, error);

    await safeReply(interaction, {
      content: 'Во время обработки Xenovoice Interface произошла ошибка.',
      ephemeral: true,
    });
  }
}
