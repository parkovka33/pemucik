import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ChannelType,
  Collection,
  PermissionFlagsBits,
} from 'discord.js';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import {
  findTempTextChannelByVoiceChannelId,
  upsertTempTextChannel,
} from '../src/db/repositories/tempTextChannelsRepo';
import { insertTempChannel } from '../src/db/repositories/tempChannelsRepo';
import {
  ensureLinkedTempTextChannel,
  syncLinkedTempTextChannelForTarget,
} from '../src/services/tempTextChannelService';
import {
  createOverwrite,
  createPermissionOverwriteManager,
  createRole,
} from './helpers/discordFakes';
import { setupTestDatabase } from './helpers/testDatabase';

function seedGuild(guildId = 'guild-text', voiceChannelId = 'voice-1'): void {
  upsertGuildSettings({
    guildId,
    categoryId: 'category-1',
    generatorChannelId: 'generator-1',
    editableByOwner: true,
    permissionSource: 'category',
    defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
    defaultUserLimit: 0,
    defaultBitrate: 0,
    language: 'ru',
    maxTempChannels: 25,
    interfaceChannelId: null,
    interfaceMessageId: null,
  });

  insertTempChannel({
    channelId: voiceChannelId,
    guildId,
    ownerUserId: 'owner-user',
    categoryId: 'category-1',
    isLocked: false,
    userLimit: 0,
  });
}

function createGuildHarness() {
  const everyoneRole = createRole('everyone', [], '@everyone');
  const adminRole = createRole('admin-role', [PermissionFlagsBits.Administrator], 'admin');
  const roles = new Collection([
    [everyoneRole.id, everyoneRole],
    [adminRole.id, adminRole],
  ]);
  const channels = new Map<string, unknown>();
  const createdChannels: unknown[] = [];

  const guild = {
    id: 'guild-text',
    roles: {
      everyone: { id: everyoneRole.id },
      cache: roles,
    },
    members: {
      me: { id: 'bot-user' },
    },
    channels: {
      async fetch(channelId: string) {
        return (channels.get(channelId) ?? null) as never;
      },
      async create(options: unknown) {
        createdChannels.push(options);

        const permissionOverwrites = createPermissionOverwriteManager([]);
        const textChannel: {
          id: string;
          type: ChannelType.GuildText;
          guild: typeof guild;
          name: string;
          topic: string | null;
          parentId: string | null;
          permissionOverwrites: ReturnType<typeof createPermissionOverwriteManager>;
          editCalls: unknown[];
          edit: (patch: unknown) => Promise<unknown>;
          delete: () => Promise<void>;
        } = {
          id: `text-${createdChannels.length}`,
          type: ChannelType.GuildText,
          guild,
          name: (options as { name: string }).name,
          topic: (options as { topic?: string }).topic ?? null,
          parentId: (options as { parent?: string }).parent ?? null,
          permissionOverwrites,
          editCalls: [] as unknown[],
          async edit(patch: unknown) {
            textChannel.editCalls.push(patch);

            const typedPatch = patch as {
              name?: string;
              topic?: string | null;
              parent?: string;
            };

            if (typedPatch.name !== undefined) {
              textChannel.name = typedPatch.name;
            }

            if (typedPatch.topic !== undefined) {
              textChannel.topic = typedPatch.topic ?? null;
            }

            if (typedPatch.parent !== undefined) {
              textChannel.parentId = typedPatch.parent;
            }

            return textChannel;
          },
          async delete() {
            channels.delete(textChannel.id);
          },
        };

        channels.set(textChannel.id, textChannel);
        return textChannel as never;
      },
    },
  };

  return {
    guild,
    channels,
    createdChannels,
  };
}

test('ensureLinkedTempTextChannel creates a tracked linked text channel with managed access', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const { guild, createdChannels } = createGuildHarness();
    const voiceChannel = {
      id: 'voice-1',
      type: ChannelType.GuildVoice,
      name: 'Raid Room',
      parentId: 'category-1',
      guild,
      members: new Collection([
        ['owner-user', { id: 'owner-user' }],
        ['guest-user', { id: 'guest-user' }],
      ]),
    };

    const target = {
      record: {
        channelId: 'voice-1',
        guildId: 'guild-text',
        ownerUserId: 'owner-user',
        categoryId: 'category-1',
        createdAt: '2026-05-06T00:00:00Z',
        lastActiveAt: '2026-05-06T00:00:00Z',
        isLocked: false,
        userLimit: 0,
      },
      channel: voiceChannel,
      actorCanManage: true,
      actorCanClaimOwnership: false,
      accessMode: 'owner',
    };

    const textChannel = await ensureLinkedTempTextChannel(target as never);

    assert.equal(textChannel.name, 'chat-raid-room');
    assert.equal(createdChannels.length, 1);

    const createOptions = createdChannels[0] as {
      parent: string;
      permissionOverwrites: Array<{ id: string }>;
    };

    assert.equal(createOptions.parent, 'category-1');
    assert.equal(createOptions.permissionOverwrites.length, 5);

    const trackedRecord = findTempTextChannelByVoiceChannelId('voice-1');
    assert.ok(trackedRecord);
    assert.equal(trackedRecord.textChannelId, 'text-1');
  } finally {
    cleanup();
  }
});

test('syncLinkedTempTextChannelForTarget renames the linked channel and removes stale member access', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const { guild, channels } = createGuildHarness();
    const permissionOverwrites = createPermissionOverwriteManager([
      createOverwrite('everyone', { deny: [PermissionFlagsBits.ViewChannel], type: 0 }),
      createOverwrite('owner-user', { allow: [PermissionFlagsBits.ViewChannel], type: 1 }),
      createOverwrite('old-user', { allow: [PermissionFlagsBits.ViewChannel], type: 1 }),
    ]);

    const textChannel: {
      id: string;
      type: ChannelType.GuildText;
      guild: typeof guild;
      name: string;
      topic: string | null;
      parentId: string | null;
      permissionOverwrites: ReturnType<typeof createPermissionOverwriteManager>;
      editCalls: unknown[];
      edit: (patch: unknown) => Promise<unknown>;
      delete: () => Promise<void>;
    } = {
      id: 'text-1',
      type: ChannelType.GuildText,
      guild,
      name: 'chat-old-room',
      topic: 'old-topic',
      parentId: 'category-old',
      permissionOverwrites,
      editCalls: [] as unknown[],
      async edit(patch: unknown) {
        textChannel.editCalls.push(patch);

        const typedPatch = patch as {
          name?: string;
          topic?: string | null;
          parent?: string;
        };

        if (typedPatch.name !== undefined) {
          textChannel.name = typedPatch.name;
        }

        if (typedPatch.topic !== undefined) {
          textChannel.topic = typedPatch.topic ?? null;
        }

        if (typedPatch.parent !== undefined) {
          textChannel.parentId = typedPatch.parent;
        }

        return textChannel;
      },
      async delete() {
        channels.delete(textChannel.id);
      },
    };

    channels.set(textChannel.id, textChannel);
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'voice-1',
      guildId: 'guild-text',
    });

    const voiceChannel = {
      id: 'voice-1',
      type: ChannelType.GuildVoice,
      name: 'New Room',
      parentId: 'category-1',
      guild,
      members: new Collection([
        ['owner-user', { id: 'owner-user' }],
        ['new-user', { id: 'new-user' }],
      ]),
    };

    const target = {
      record: {
        channelId: 'voice-1',
        guildId: 'guild-text',
        ownerUserId: 'owner-user',
        categoryId: 'category-1',
        createdAt: '2026-05-06T00:00:00Z',
        lastActiveAt: '2026-05-06T00:00:00Z',
        isLocked: false,
        userLimit: 0,
      },
      channel: voiceChannel,
      actorCanManage: true,
      actorCanClaimOwnership: false,
      accessMode: 'owner',
    };

    await syncLinkedTempTextChannelForTarget(target as never);

    assert.equal(textChannel.name, 'chat-new-room');
    assert.equal(textChannel.parentId, 'category-1');
    assert.equal(permissionOverwrites.cache.get('new-user')?.allow.has(PermissionFlagsBits.ViewChannel), true);
    assert.equal(permissionOverwrites.cache.get('old-user')?.allow.has(PermissionFlagsBits.ViewChannel), false);
  } finally {
    cleanup();
  }
});
