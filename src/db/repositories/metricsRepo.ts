import { getDatabase } from '../database';

import type { MetricCounterKey } from '../../types';

const METRIC_COUNTER_COLUMNS: Record<MetricCounterKey, string> = {
  channels_created: 'channels_created',
  creation_failed: 'creation_failed',
  channels_deleted: 'channels_deleted',
  rename_used: 'rename_used',
  lock_used: 'lock_used',
  unlock_used: 'unlock_used',
  limit_used: 'limit_used',
};

export function incrementMetricCounter(guildId: string, metric: MetricCounterKey): void {
  const database = getDatabase();
  const column = METRIC_COUNTER_COLUMNS[metric];

  database.prepare(
    `INSERT INTO metrics (guild_id, ${column}, last_active_at)
    VALUES (?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id) DO UPDATE SET
      ${column} = ${column} + 1,
      last_active_at = CURRENT_TIMESTAMP`,
  ).run(guildId);
}
