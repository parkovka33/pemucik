import { REST, Routes } from 'discord.js';

import { commands } from '../src/commands';
import { getEnv } from '../src/config/env';

function shouldClearOppositeScope(): boolean {
  return process.env.DISCORD_CLEAR_OPPOSITE_SCOPE?.trim().toLowerCase() === 'true';
}

async function registerCommands(): Promise<void> {
  const env = getEnv();
  const rest = new REST({ version: '10' }).setToken(env.discordToken);
  const body = commands.map((command) => command.data.toJSON());
  const clearOppositeScope = shouldClearOppositeScope();

  if (env.discordGuildId) {
    await rest.put(
      Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId),
      { body },
    );
    console.log(`Registered ${body.length} guild commands.`);

    if (clearOppositeScope) {
      await rest.put(Routes.applicationCommands(env.discordClientId), { body: [] });
      console.log('Cleared global commands.');
    }

    return;
  }

  await rest.put(Routes.applicationCommands(env.discordClientId), { body });
  console.log(`Registered ${body.length} global commands.`);
}

registerCommands().catch((error: unknown) => {
  console.error('Failed to register commands.', error);
  process.exitCode = 1;
});
