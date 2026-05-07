import { REST, Routes } from 'discord.js';

import { commands } from '../src/commands';
import { getEnv } from '../src/config/env';

async function registerCommands(): Promise<void> {
  const env = getEnv();
  const rest = new REST({ version: '10' }).setToken(env.discordToken);
  const body = commands.map((command) => command.data.toJSON());

  if (env.discordGuildId) {
    await rest.put(
      Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId),
      { body },
    );
    console.log(`Registered ${body.length} guild commands.`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.discordClientId), { body });
  console.log(`Registered ${body.length} global commands.`);
}

registerCommands().catch((error: unknown) => {
  console.error('Failed to register commands.', error);
  process.exitCode = 1;
});
