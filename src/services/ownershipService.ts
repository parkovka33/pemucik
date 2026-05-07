import {
  findTempChannelByChannelId,
  findTempChannelByOwner,
} from '../db/repositories/tempChannelsRepo';

import type { TempChannelRecord } from '../types';

export function findOwnedTempChannel(guildId: string, userId: string): TempChannelRecord | null {
  return findTempChannelByOwner(guildId, userId);
}

export function findTempChannelOwnership(channelId: string): TempChannelRecord | null {
  return findTempChannelByChannelId(channelId);
}
