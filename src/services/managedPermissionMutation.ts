import {
  ChannelType,
  PermissionFlagsBits,
  type GuildMember,
  type Role,
  type VoiceChannel,
} from 'discord.js';

export type ManagedPermissionName = 'Connect' | 'ViewChannel';
export type ManagedPermissionState = 'allow' | 'deny' | 'neutral';

export interface ManagedRestrictionResult {
  channel: VoiceChannel;
  skippedDeniedManageRoleIds: string[];
}

export class ManagedPermissionMutationError extends Error {
  public constructor(
    public readonly code:
      | 'CHANNEL_UNAVAILABLE'
      | 'BOT_MEMBER_UNAVAILABLE'
      | 'UNSAFE_EXPLICIT_DENY'
      | 'UNSAFE_MANAGEMENT_DENY'
      | 'FORWARD_MUTATION_FAILED'
      | 'VERIFICATION_FAILED'
      | 'ROLLBACK_FAILED',
    message: string,
    public readonly details: {
      operation: 'lock' | 'ghost';
      guildId: string;
      channelId: string;
      permission: ManagedPermissionName;
      originalError?: unknown;
      rollbackFailures: Array<{ overwriteId: string; error: unknown }>;
      observedStates: Record<string, ManagedPermissionState>;
      everyoneState: ManagedPermissionState;
    },
  ) {
    super(message);
    this.name = 'ManagedPermissionMutationError';
  }
}

interface MutationTarget {
  id: string;
  desiredState: ManagedPermissionState;
}

function getPermissionState(
  channel: VoiceChannel,
  overwriteId: string,
  permission: ManagedPermissionName,
): ManagedPermissionState {
  const overwrite = channel.permissionOverwrites.cache.get(overwriteId);
  const bit = PermissionFlagsBits[permission];

  if (overwrite?.allow.has(bit)) {
    return 'allow';
  }

  if (overwrite?.deny.has(bit)) {
    return 'deny';
  }

  return 'neutral';
}

function statePatch(
  permission: ManagedPermissionName,
  state: ManagedPermissionState,
): Partial<Record<ManagedPermissionName, boolean | null>> {
  return {
    [permission]: state === 'allow' ? true : state === 'deny' ? false : null,
  };
}

async function fetchFreshVoiceChannel(
  channel: VoiceChannel,
  operation: 'lock' | 'ghost',
  permission: ManagedPermissionName,
): Promise<VoiceChannel> {
  const fresh = await channel.guild.channels.fetch(channel.id);

  if (!fresh || fresh.type !== ChannelType.GuildVoice) {
    throw new ManagedPermissionMutationError(
      'CHANNEL_UNAVAILABLE',
      `Permission mutation refused because channel ${channel.id} is no longer a voice channel.`,
      {
        operation,
        guildId: channel.guild.id,
        channelId: channel.id,
        permission,
        rollbackFailures: [],
        observedStates: {},
        everyoneState: 'neutral',
      },
    );
  }

  return fresh as VoiceChannel;
}

function getManagementRoles(channel: VoiceChannel): {
  administratorRoles: Role[];
  manageChannelRoles: Role[];
} {
  const everyoneRoleId = channel.guild.roles.everyone.id;
  const roles = channel.guild.roles.cache.filter((role) => role.id !== everyoneRoleId);

  return {
    administratorRoles: roles
      .filter((role) => role.permissions.has(PermissionFlagsBits.Administrator))
      .map((role) => role),
    manageChannelRoles: roles
      .filter((role) =>
        !role.permissions.has(PermissionFlagsBits.Administrator)
        && role.permissions.has(PermissionFlagsBits.ManageChannels)
      )
      .map((role) => role),
  };
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildMutationError(
  code: ManagedPermissionMutationError['code'],
  message: string,
  context: {
    operation: 'lock' | 'ghost';
    channel: VoiceChannel;
    permission: ManagedPermissionName;
    originalError?: unknown;
    rollbackFailures?: Array<{ overwriteId: string; error: unknown }>;
    observedStates?: Record<string, ManagedPermissionState>;
  },
): ManagedPermissionMutationError {
  const everyoneRoleId = context.channel.guild.roles.everyone.id;
  const observedStates = context.observedStates ?? {};
  const rollbackFailures = context.rollbackFailures ?? [];
  const diagnostics = rollbackFailures.length === 0
    ? ''
    : ` Rollback failures: ${rollbackFailures.map((failure) =>
      `${failure.overwriteId}: ${describeFailure(failure.error)}`
    ).join('; ')}. Observed states: ${JSON.stringify(observedStates)}.`;

  return new ManagedPermissionMutationError(
    code,
    `${message}${diagnostics}`,
    {
      operation: context.operation,
      guildId: context.channel.guild.id,
      channelId: context.channel.id,
      permission: context.permission,
      ...(context.originalError === undefined ? {} : { originalError: context.originalError }),
      rollbackFailures,
      observedStates,
      everyoneState: observedStates[everyoneRoleId]
        ?? getPermissionState(context.channel, everyoneRoleId, context.permission),
    },
  );
}

async function readSafetyMembers(
  channel: VoiceChannel,
  ownerId: string,
  operation: 'lock' | 'ghost',
  permission: ManagedPermissionName,
): Promise<{ owner: GuildMember; bot: GuildMember }> {
  const bot = channel.guild.members.me;

  if (!bot) {
    throw buildMutationError(
      'BOT_MEMBER_UNAVAILABLE',
      'Permission mutation refused because the bot member is unavailable.',
      { operation, channel, permission },
    );
  }

  const owner = await channel.guild.members.fetch(ownerId);

  return { owner, bot };
}

function verifyEffectivePermission(
  channel: VoiceChannel,
  subject: GuildMember | Role,
  permission: ManagedPermissionName,
): boolean {
  return channel.permissionsFor(subject)?.has(PermissionFlagsBits[permission]) ?? false;
}

function collectObservedStates(
  channel: VoiceChannel,
  overwriteIds: readonly string[],
  permission: ManagedPermissionName,
): Record<string, ManagedPermissionState> {
  return Object.fromEntries(
    overwriteIds.map((overwriteId) => [
      overwriteId,
      getPermissionState(channel, overwriteId, permission),
    ]),
  );
}

async function rollbackManagedChanges(
  channel: VoiceChannel,
  operation: 'lock' | 'ghost',
  permission: ManagedPermissionName,
  originalStates: ReadonlyMap<string, ManagedPermissionState>,
  mutationOrder: readonly string[],
): Promise<{
  channel: VoiceChannel;
  failures: Array<{ overwriteId: string; error: unknown }>;
  observedStates: Record<string, ManagedPermissionState>;
}> {
  let fresh = await fetchFreshVoiceChannel(channel, operation, permission);
  const failures: Array<{ overwriteId: string; error: unknown }> = [];

  for (const overwriteId of [...mutationOrder].reverse()) {
    const originalState = originalStates.get(overwriteId);

    if (!originalState || getPermissionState(fresh, overwriteId, permission) === originalState) {
      continue;
    }

    try {
      await fresh.permissionOverwrites.edit(overwriteId, statePatch(permission, originalState));
    } catch (error) {
      failures.push({ overwriteId, error });
    }

    fresh = await fetchFreshVoiceChannel(fresh, operation, permission);
  }

  return {
    channel: fresh,
    failures,
    observedStates: collectObservedStates(fresh, [...originalStates.keys()], permission),
  };
}

export async function applyRecoverableRoomRestriction(input: {
  channel: VoiceChannel;
  ownerId: string;
  permission: ManagedPermissionName;
  operation: 'lock' | 'ghost';
}): Promise<ManagedRestrictionResult> {
  let channel = await fetchFreshVoiceChannel(input.channel, input.operation, input.permission);
  const everyoneRoleId = channel.guild.roles.everyone.id;
  const { owner, bot } = await readSafetyMembers(
    channel,
    input.ownerId,
    input.operation,
    input.permission,
  );
  const { administratorRoles, manageChannelRoles } = getManagementRoles(channel);
  const ownerState = getPermissionState(channel, owner.id, input.permission);
  const botState = getPermissionState(channel, bot.id, input.permission);

  if (ownerState === 'deny' || botState === 'deny') {
    const deniedIds = [
      ...(ownerState === 'deny' ? [owner.id] : []),
      ...(botState === 'deny' ? [bot.id] : []),
    ];

    throw buildMutationError(
      'UNSAFE_EXPLICIT_DENY',
      `Permission mutation refused because required safety overwrite(s) contain an explicit deny: ${deniedIds.join(', ')}.`,
      { operation: input.operation, channel, permission: input.permission },
    );
  }

  const skippedDeniedManageRoleIds = manageChannelRoles
    .filter((role) => getPermissionState(channel, role.id, input.permission) === 'deny')
    .map((role) => role.id);
  const safeManageRoles = manageChannelRoles.filter(
    (role) => getPermissionState(channel, role.id, input.permission) !== 'deny',
  );

  if (
    administratorRoles.length === 0
    && manageChannelRoles.length > 0
    && safeManageRoles.length === 0
  ) {
    throw buildMutationError(
      'UNSAFE_MANAGEMENT_DENY',
      `Permission mutation refused because all ManageChannels roles explicitly deny ${input.permission}.`,
      { operation: input.operation, channel, permission: input.permission },
    );
  }

  const targets: MutationTarget[] = [
    { id: owner.id, desiredState: 'allow' },
    { id: bot.id, desiredState: 'allow' },
    ...safeManageRoles.map((role) => ({ id: role.id, desiredState: 'allow' as const })),
    { id: everyoneRoleId, desiredState: 'deny' },
  ];
  const originalStates = new Map<string, ManagedPermissionState>(
    targets.map((target) => [
      target.id,
      getPermissionState(channel, target.id, input.permission),
    ]),
  );
  const mutationOrder: string[] = [];

  try {
    for (const target of targets) {
      if (getPermissionState(channel, target.id, input.permission) === target.desiredState) {
        continue;
      }

      mutationOrder.push(target.id);
      await channel.permissionOverwrites.edit(
        target.id,
        statePatch(input.permission, target.desiredState),
      );
      channel = await fetchFreshVoiceChannel(channel, input.operation, input.permission);
    }

    channel = await fetchFreshVoiceChannel(channel, input.operation, input.permission);

    const everyoneRestricted = getPermissionState(channel, everyoneRoleId, input.permission) === 'deny';
    const ownerSafe = verifyEffectivePermission(channel, owner, input.permission);
    const botSafe = verifyEffectivePermission(channel, bot, input.permission);
    const managementSafe = administratorRoles.length > 0
      || safeManageRoles.every((role) => verifyEffectivePermission(channel, role, input.permission));

    if (!everyoneRestricted || !ownerSafe || !botSafe || !managementSafe) {
      throw buildMutationError(
        'VERIFICATION_FAILED',
        `Discord permission verification failed after ${input.operation}.`,
        { operation: input.operation, channel, permission: input.permission },
      );
    }

    return {
      channel,
      skippedDeniedManageRoleIds,
    };
  } catch (error) {
    let rollback: Awaited<ReturnType<typeof rollbackManagedChanges>>;

    try {
      rollback = await rollbackManagedChanges(
        channel,
        input.operation,
        input.permission,
        originalStates,
        mutationOrder,
      );
    } catch (rollbackError) {
      const observedStates = collectObservedStates(
        channel,
        [...originalStates.keys()],
        input.permission,
      );

      throw buildMutationError(
        'ROLLBACK_FAILED',
        `Permission mutation failed and rollback state could not be refreshed after ${input.operation}. Original error: ${describeFailure(error)}.`,
        {
          operation: input.operation,
          channel,
          permission: input.permission,
          originalError: error,
          rollbackFailures: [{ overwriteId: 'channel_refetch', error: rollbackError }],
          observedStates,
        },
      );
    }

    if (rollback.failures.length > 0) {
      throw buildMutationError(
        'ROLLBACK_FAILED',
        `Permission mutation failed and rollback was incomplete after ${input.operation}. Original error: ${describeFailure(error)}.`,
        {
          operation: input.operation,
          channel: rollback.channel,
          permission: input.permission,
          originalError: error,
          rollbackFailures: rollback.failures,
          observedStates: rollback.observedStates,
        },
      );
    }

    throw buildMutationError(
      error instanceof ManagedPermissionMutationError
        ? error.code
        : 'FORWARD_MUTATION_FAILED',
      `Permission mutation failed and was rolled back after ${input.operation}: ${describeFailure(error)}.`,
      {
        operation: input.operation,
        channel: rollback.channel,
        permission: input.permission,
        originalError: error,
        observedStates: rollback.observedStates,
      },
    );
  }
}
