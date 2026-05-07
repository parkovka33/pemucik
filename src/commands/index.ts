import { helpCommand } from './help';
import { interfaceCommand } from './interface';
import { resetCommand } from './reset';
import { setCommand } from './set';
import { setupCommand } from './setup';
import { supportCommand } from './support';
import { voiceCommand } from './voice';

import type { AppCommand } from '../types';

export const commands: AppCommand[] = [
  helpCommand,
  setupCommand,
  supportCommand,
  voiceCommand,
  setCommand,
  resetCommand,
  interfaceCommand,
];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
