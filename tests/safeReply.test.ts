import assert from 'node:assert/strict';
import test from 'node:test';

import { safeReply } from '../src/utils/safeReply';

test('safeReply ignores unknown interaction errors from reply', async () => {
  let called = false;

  const interaction = {
    deferred: false,
    replied: false,
    async reply() {
      called = true;
      const error = new Error('Unknown interaction') as Error & { code: number };
      error.code = 10062;
      throw error;
    },
  };

  await assert.doesNotReject(async () => {
    await safeReply(interaction as never, { content: 'test', ephemeral: true });
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
      const error = new Error('Interaction has already been acknowledged.') as Error & { code: number };
      error.code = 40060;
      throw error;
    },
  };

  await assert.doesNotReject(async () => {
    await safeReply(interaction as never, { content: 'test', ephemeral: true });
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
    await safeReply(interaction as never, { content: 'test', ephemeral: true });
  });
});
