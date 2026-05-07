import {
  Collection,
  PermissionFlagsBits,
  PermissionsBitField,
  type Snowflake,
} from 'discord.js';

type ManagedPermissionName = 'Connect' | 'ViewChannel' | 'SendMessages' | 'ReadMessageHistory';

const MANAGED_PERMISSION_BITS: Record<ManagedPermissionName, bigint> = {
  Connect: PermissionFlagsBits.Connect,
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
};

export interface FakeOverwrite {
  id: Snowflake;
  allow: PermissionsBitField;
  deny: PermissionsBitField;
  type?: number | string;
}

export interface PermissionEditCall {
  id: Snowflake;
  patch: Partial<Record<ManagedPermissionName, boolean | null>>;
}

export function createOverwrite(
  id: Snowflake,
  options?: {
    allow?: bigint[];
    deny?: bigint[];
    type?: number | string;
  },
): FakeOverwrite {
  const overwrite: FakeOverwrite = {
    id,
    allow: new PermissionsBitField(options?.allow ?? []),
    deny: new PermissionsBitField(options?.deny ?? []),
  };

  if (options?.type !== undefined) {
    overwrite.type = options.type;
  }

  return overwrite;
}

export function createPermissionOverwriteManager(initial: FakeOverwrite[]) {
  const cache = new Collection<Snowflake, FakeOverwrite>();
  const editCalls: PermissionEditCall[] = [];

  initial.forEach((overwrite) => {
    cache.set(overwrite.id, overwrite);
  });

  return {
    cache,
    editCalls,
    async edit(
      id: Snowflake,
      patch: Partial<Record<ManagedPermissionName, boolean | null>>,
    ): Promise<FakeOverwrite> {
      editCalls.push({ id, patch: { ...patch } });

      const existing = cache.get(id) ?? createOverwrite(id);

      (Object.keys(patch) as ManagedPermissionName[]).forEach((permission) => {
        const value = patch[permission];
        const bit = MANAGED_PERMISSION_BITS[permission];

        if (value === true) {
          existing.allow.add(bit);
          existing.deny.remove(bit);
          return;
        }

        if (value === false) {
          existing.deny.add(bit);
          existing.allow.remove(bit);
          return;
        }

        if (value === null) {
          existing.allow.remove(bit);
          existing.deny.remove(bit);
        }
      });

      cache.set(id, existing);
      return existing;
    },
  };
}

export function createRole(
  id: Snowflake,
  permissions: bigint[],
  name = `role-${id}`,
) {
  return {
    id,
    name,
    permissions: new PermissionsBitField(permissions),
  };
}
