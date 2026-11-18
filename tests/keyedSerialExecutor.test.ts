import assert from 'node:assert/strict';
import test from 'node:test';

import { KeyedSerialExecutor } from '../src/utils/keyedSerialExecutor';

test('KeyedSerialExecutor runs matching keys one at a time in arrival order', async () => {
  const executor = new KeyedSerialExecutor();
  const events: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = executor.run('guild-1', async () => {
    events.push('first:start');
    await firstCanFinish;
    events.push('first:end');
  });
  const second = executor.run('guild-1', async () => {
    events.push('second:start');
    events.push('second:end');
  });

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(events, ['first:start']);

  releaseFirst?.();
  await Promise.all([first, second]);

  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);
});

test('KeyedSerialExecutor does not block independent keys', async () => {
  const executor = new KeyedSerialExecutor();
  const events: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstCanFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = executor.run('guild-1', async () => {
    events.push('guild-1:start');
    await firstCanFinish;
  });
  const second = executor.run('guild-2', async () => {
    events.push('guild-2:start');
  });

  await second;
  assert.deepEqual(events, ['guild-1:start', 'guild-2:start']);

  releaseFirst?.();
  await first;
});

test('KeyedSerialExecutor releases a key after a failed operation', async () => {
  const executor = new KeyedSerialExecutor();

  await assert.rejects(
    executor.run('guild-1', async () => {
      throw new Error('boom');
    }),
    /boom/,
  );

  const result = await executor.run('guild-1', async () => 'recovered');
  assert.equal(result, 'recovered');
});
