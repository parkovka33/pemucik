import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags } from 'discord.js';

import { safeReply } from '../src/utils/safeReply';

test('safeReply ignores unknown interaction errors from reply', async () => {
  let called = false;

  const interaction = {
    deferred: false,
    replied: false,
    async reply() {
      called = true;
      const error = new Error('Unknown interaction') as Error & {
        code: number;
      };
      error.code = 10062;
      throw error;
    },
  };

  await assert.doesNotReject(async () => {
    await safeReply(interaction as never, {
      content: 'test',
      flags: MessageFlags.Ephemeral,
    });
  });

  assert.equal(called, true);
});

test('safeReply ignores already acknowledged errors from followUp', async () => {
  let called = false;

  const interaction = {
    deferred: false,
    replied: true,
    async followUp() {
      called = true;
      const error = new Error(
        'Interaction has already been acknowledged.',
      ) as Error & { code: number };
      error.code = 40060;
      throw error;
    },
  };

  await assert.doesNotReject(async () => {
    await safeReply(interaction as never, {
      content: 'test',
      flags: MessageFlags.Ephemeral,
    });
  });

  assert.equal(called, true);
});

test('safeReply still rethrows non-Discord interaction response errors', async () => {
  const interaction = {
    deferred: false,
    replied: false,
    async reply() {
      throw new Error('boom');
    },
  };

  await assert.rejects(async () => {
    await safeReply(interaction as never, {
      content: 'test',
      flags: MessageFlags.Ephemeral,
    });
  });
});

test('safeReply edits a deferred response without trying to change ephemeral flags', async () => {
  let receivedOptions: unknown;

  const interaction = {
    deferred: true,
    replied: false,
    async editReply(options: unknown) {
      receivedOptions = options;
    },
  };

  await safeReply(interaction as never, {
    content: 'done',
    flags: MessageFlags.Ephemeral,
  });

  assert.deepEqual(receivedOptions, { content: 'done' });
});

test('safeReply logs an expired interaction when a logger is provided', async () => {
  const warnings: unknown[] = [];
  const interaction = {
    id: 'interaction-1',
    guildId: 'guild-1',
    user: { id: 'user-1' },
    deferred: false,
    replied: false,
    async reply() {
      const error = new Error('Unknown interaction') as Error & {
        code: number;
      };
      error.code = 10062;
      throw error;
    },
  };
  const logger = {
    warn(payload: unknown) {
      warnings.push(payload);
    },
  };

  await safeReply(
    interaction as never,
    { content: 'test', flags: MessageFlags.Ephemeral },
    logger as never,
  );

  assert.deepEqual(warnings, [
    {
      event: 'interaction_response_expired',
      interactionId: 'interaction-1',
      guildId: 'guild-1',
      userId: 'user-1',
      errorCode: 10062,
    },
  ]);
});
