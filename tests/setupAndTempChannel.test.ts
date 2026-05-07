import assert from 'node:assert/strict';
import test from 'node:test';

import { ChannelType, Collection, PermissionFlagsBits } from 'discord.js';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { getDatabase } from '../src/db/database';
import { findGuildSettingsByGuildId, upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import { runSetup } from '../src/services/setupService';
import { createTempChannelForMember } from '../src/services/tempChannelService';
import { setupTestDatabase } from './helpers/testDatabase';

test('createTempChannelForMember clones generator overwrites and owner editability when configured', async () => {
  const createdChannels: unknown[] = [];
  const category = { id: 'category-1', type: ChannelType.GuildCategory };
  const generatorOverwrite = {
    id: 'vip-role',
    allow: { bitfield: PermissionFlagsBits.Connect },
    deny: { bitfield: PermissionFlagsBits.Speak },
    type: 0,
  };

  const guild = {
    channels: {
      fetch: async (channelId: string) => {
        assert.equal(channelId, 'category-1');
        return category;
      },
      create: async (options: unknown) => {
        createdChannels.push(options);
        return {
          id: 'temp-1',
          name: 'Комната Xenon',
        };
      },
    },
  };

  const member = {
    id: 'user-1',
    displayName: 'Xenon',
    user: {
      username: 'xenon',
      tag: 'xenon#0001',
    },
    guild,
    voice: {
      channel: {
        permissionOverwrites: {
          cache: new Collection([[generatorOverwrite.id, generatorOverwrite]]),
        },
      },
    },
  };

  await createTempChannelForMember(member as never, {
    guildId: 'guild-1',
    categoryId: 'category-1',
    generatorChannelId: 'generator-1',
    editableByOwner: true,
    permissionSource: 'generator',
    defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
    defaultUserLimit: 0,
    defaultBitrate: 0,
    language: 'ru',
    maxTempChannels: 25,
    interfaceChannelId: null,
    interfaceMessageId: null,
    createdAt: '2026-05-06T00:00:00Z',
    updatedAt: '2026-05-06T00:00:00Z',
  });

  assert.equal(createdChannels.length, 1);

  const channelOptions = createdChannels[0] as {
    permissionOverwrites?: Array<{
      id: string;
      allow?: bigint | bigint[];
      deny?: bigint;
      type?: number;
    }>;
    name: string;
    parent: string;
  };

  assert.equal(channelOptions.name, 'Комната Xenon');
  assert.equal(channelOptions.parent, 'category-1');
  assert.equal(channelOptions.permissionOverwrites?.length, 2);
  assert.deepEqual(channelOptions.permissionOverwrites?.[0], {
    id: 'vip-role',
    allow: PermissionFlagsBits.Connect,
    deny: PermissionFlagsBits.Speak,
    type: 0,
  });
  assert.deepEqual(channelOptions.permissionOverwrites?.[1], {
    id: 'user-1',
    allow: [PermissionFlagsBits.ManageChannels],
  });
});

test('createTempChannelForMember leaves permissionOverwrites empty for category-based non-editable rooms', async () => {
  const createdChannels: unknown[] = [];
  const category = { id: 'category-2', type: ChannelType.GuildCategory };

  const guild = {
    channels: {
      fetch: async () => category,
      create: async (options: unknown) => {
        createdChannels.push(options);
        return {
          id: 'temp-2',
          name: 'Комната Xenon',
        };
      },
    },
  };

  const member = {
    id: 'user-2',
    displayName: 'Xenon',
    user: {
      username: 'xenon',
      tag: 'xenon#0002',
    },
    guild,
    voice: {
      channel: null,
    },
  };

  await createTempChannelForMember(member as never, {
    guildId: 'guild-1',
    categoryId: 'category-2',
    generatorChannelId: 'generator-2',
    editableByOwner: false,
    permissionSource: 'category',
    defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
    defaultUserLimit: 0,
    defaultBitrate: 0,
    language: 'ru',
    maxTempChannels: 25,
    interfaceChannelId: null,
    interfaceMessageId: null,
    createdAt: '2026-05-06T00:00:00Z',
    updatedAt: '2026-05-06T00:00:00Z',
  });

  const channelOptions = createdChannels[0] as { permissionOverwrites?: unknown[] };
  assert.equal(channelOptions.permissionOverwrites, undefined);
});

test('runSetup preserves unrelated guild defaults while updating editable and permission source', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    upsertGuildSettings({
      guildId: 'guild-setup',
      categoryId: 'category-existing',
      generatorChannelId: 'generator-existing',
      editableByOwner: true,
      permissionSource: 'category',
      defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
      defaultUserLimit: 0,
      defaultBitrate: 96_000,
      language: 'ru',
      maxTempChannels: 25,
      interfaceChannelId: 'interface-1',
      interfaceMessageId: 'message-1',
    });

    const guild = {
      id: 'guild-setup',
      members: {
        me: {
          permissions: {
            has: () => true,
          },
        },
      },
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === 'category-existing') {
            return { id: channelId, type: ChannelType.GuildCategory };
          }

          if (channelId === 'generator-existing') {
            return { id: channelId, type: ChannelType.GuildVoice, parentId: 'category-existing' };
          }

          return null;
        },
        cache: new Collection(),
        create: async () => {
          throw new Error('runSetup should reuse configured channels in this scenario.');
        },
      },
    };

    const result = await runSetup(guild as never, {
      editableByOwner: false,
      permissionSource: 'generator',
    });

    assert.equal(result.categoryCreated, false);
    assert.equal(result.generatorCreated, false);

    const settings = findGuildSettingsByGuildId('guild-setup');
    assert.ok(settings);
    assert.equal(settings.editableByOwner, false);
    assert.equal(settings.permissionSource, 'generator');
    assert.equal(settings.defaultBitrate, 96_000);
    assert.equal(settings.interfaceChannelId, 'interface-1');
    assert.equal(settings.interfaceMessageId, 'message-1');

    const row = getDatabase()
      .prepare(
        `SELECT editable_by_owner, permission_source, default_bitrate, interface_channel_id, interface_message_id
        FROM guild_settings
        WHERE guild_id = ?`,
      )
      .get('guild-setup') as {
        editable_by_owner: number;
        permission_source: string;
        default_bitrate: number;
        interface_channel_id: string | null;
        interface_message_id: string | null;
      };

    assert.deepEqual(row, {
      editable_by_owner: 0,
      permission_source: 'generator',
      default_bitrate: 96_000,
      interface_channel_id: 'interface-1',
      interface_message_id: 'message-1',
    });
  } finally {
    cleanup();
  }
});

test('runSetup creates a new generator when setup is moved to a different category', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    upsertGuildSettings({
      guildId: 'guild-move',
      categoryId: 'category-old',
      generatorChannelId: 'generator-old',
      editableByOwner: true,
      permissionSource: 'category',
      defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
      defaultUserLimit: 0,
      defaultBitrate: 64_000,
      language: 'ru',
      maxTempChannels: 25,
      interfaceChannelId: 'interface-old',
      interfaceMessageId: 'message-old',
    });

    const newCategory = { id: 'category-new', type: ChannelType.GuildCategory };
    const createdChannels: unknown[] = [];

    const guild = {
      id: 'guild-move',
      members: {
        me: {
          permissions: {
            has: () => true,
          },
        },
      },
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === 'generator-old') {
            return {
              id: 'generator-old',
              type: ChannelType.GuildVoice,
              parentId: 'category-old',
              name: 'old-generator',
            };
          }

          if (channelId === 'category-old') {
            return { id: 'category-old', type: ChannelType.GuildCategory };
          }

          return null;
        },
        cache: new Collection(),
        create: async (options: unknown) => {
          createdChannels.push(options);

          return {
            id: 'generator-new',
            type: ChannelType.GuildVoice,
            parentId: 'category-new',
            name: 'generator-new',
          };
        },
      },
    };

    const result = await runSetup(guild as never, {
      editableByOwner: false,
      category: newCategory as never,
      permissionSource: 'generator',
    });

    assert.equal(result.categoryCreated, false);
    assert.equal(result.generatorCreated, true);
    assert.equal(createdChannels.length, 1);

    const generatorCreateOptions = createdChannels[0] as {
      parent: string;
      type: ChannelType;
      userLimit: number;
    };

    assert.equal(generatorCreateOptions.parent, 'category-new');
    assert.equal(generatorCreateOptions.type, ChannelType.GuildVoice);
    assert.equal(generatorCreateOptions.userLimit, 0);

    const settings = findGuildSettingsByGuildId('guild-move');
    assert.ok(settings);
    assert.equal(settings.categoryId, 'category-new');
    assert.equal(settings.generatorChannelId, 'generator-new');
    assert.equal(settings.defaultBitrate, 64_000);
    assert.equal(settings.interfaceChannelId, 'interface-old');
    assert.equal(settings.interfaceMessageId, 'message-old');
  } finally {
    cleanup();
  }
});
