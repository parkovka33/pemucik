# Tech Stack & Tools

## Core Stack
- **Platform:** Discord only
- **Runtime:** Node.js LTS
- **Language:** TypeScript
- **Discord Library:** discord.js v14
- **Database:** SQLite
- **SQLite Library:** better-sqlite3
- **Process Manager:** PM2
- **Monitoring:** Free uptime monitor + PM2 logs + file logs
- **Dashboard:** None — all setup and control happens through Discord commands, buttons, selects, modals, and embeds
- **Frontend:** No web frontend for MVP. The "UI" is Discord-native interactions.
- **Styling:** No web styling system. UX is defined through Discord embeds, buttons, select menus, and modal copy.
- **Authentication:** Discord bot token via `.env`; authorization through Discord permissions and channel ownership checks

## Why This Stack Exists
This stack is optimized for the MVP constraints:
- Discord-only experience
- no website
- no custom domain
- under $10/month hosting
- easy AI-assisted implementation
- reliable event-driven voice automation

It is intentionally simple: one Node.js bot process, one SQLite database file, one Linux VPS, and Discord-native controls.

## Setup Commands
Use only the commands explicitly defined by the project planning docs:

```bash
npm install
npm run dev
npm run build
npm start
npm run commands:register
npm run db:migrate
npm run lint
npm run format
```

## Initial Bootstrap Commands from the Tech Design
These are the original scaffold commands captured from the design docs:

```bash
npm init -y
npm install discord.js dotenv better-sqlite3
npm install -D typescript tsx @types/node eslint prettier
npx tsc --init
```

## Recommended package.json Scripts
```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "commands:register": "tsx scripts/registerCommands.ts",
    "db:migrate": "tsx src/db/migrate.ts",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write ."
  }
}
```

## Environment Variables
```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=optional_test_guild_id_for_dev_commands
DATABASE_PATH=./data/pemucik.sqlite
LOG_LEVEL=info
NODE_ENV=production
SUPPORT_SERVER_URL=https://discord.gg/your-support-server
DONATION_URL=https://ko-fi.com/your-page
```

## Required Local Tools
- **Editor / IDE:** VS Code or Windsurf
- **AI helpers:** Claude Code, Codex, ChatGPT, or similar for one-feature-at-a-time implementation
- **Runtime:** Node.js LTS
- **Version Control:** Git
- **Database CLI:** SQLite CLI
- **Bot setup:** Discord Developer Portal

## Project Structure
```text
pemucik/
├── src/
│   ├── index.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── constants.ts
│   ├── client/
│   │   └── discordClient.ts
│   ├── commands/
│   │   ├── setup.ts
│   │   ├── panel.ts
│   │   ├── help.ts
│   │   ├── support.ts
│   │   └── settings.ts
│   ├── events/
│   │   ├── ready.ts
│   │   ├── interactionCreate.ts
│   │   └── voiceStateUpdate.ts
│   ├── interactions/
│   │   ├── buttons/
│   │   │   ├── lockChannel.ts
│   │   │   ├── unlockChannel.ts
│   │   │   ├── refreshPanel.ts
│   │   │   └── openRenameModal.ts
│   │   ├── modals/
│   │   │   ├── renameChannelModal.ts
│   │   │   └── setLimitModal.ts
│   │   └── panels/
│   │       └── ownerPanel.ts
│   ├── services/
│   │   ├── setupService.ts
│   │   ├── tempChannelService.ts
│   │   ├── ownershipService.ts
│   │   ├── permissionService.ts
│   │   ├── cleanupService.ts
│   │   ├── cooldownService.ts
│   │   └── metricsService.ts
│   ├── db/
│   │   ├── database.ts
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   └── repositories/
│   │       ├── guildSettingsRepo.ts
│   │       ├── tempChannelsRepo.ts
│   │       └── metricsRepo.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── permissions.ts
│   │   ├── validation.ts
│   │   ├── discordErrors.ts
│   │   └── safeReply.ts
│   └── types/
│       └── index.ts
├── scripts/
│   ├── registerCommands.ts
│   ├── backupSqlite.sh
│   └── healthcheck.ts
├── data/
│   └── pemucik.sqlite
├── logs/
│   └── app.log
├── docs/
│   ├── troubleshooting.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

## Database Schema
```sql
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  generator_channel_id TEXT NOT NULL,
  default_name_template TEXT NOT NULL DEFAULT "{user}'s Room",
  default_user_limit INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT "en",
  max_temp_channels INTEGER NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS temp_channels (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_locked INTEGER NOT NULL DEFAULT 0,
  user_limit INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
);

CREATE INDEX IF NOT EXISTS idx_temp_channels_guild_id
ON temp_channels(guild_id);

CREATE INDEX IF NOT EXISTS idx_temp_channels_owner_user_id
ON temp_channels(owner_user_id);

CREATE TABLE IF NOT EXISTS user_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, action)
);

CREATE TABLE IF NOT EXISTS metrics (
  guild_id TEXT PRIMARY KEY,
  channels_created INTEGER NOT NULL DEFAULT 0,
  creation_failed INTEGER NOT NULL DEFAULT 0,
  channels_deleted INTEGER NOT NULL DEFAULT 0,
  rename_used INTEGER NOT NULL DEFAULT 0,
  lock_used INTEGER NOT NULL DEFAULT 0,
  unlock_used INTEGER NOT NULL DEFAULT 0,
  limit_used INTEGER NOT NULL DEFAULT 0,
  support_used INTEGER NOT NULL DEFAULT 0,
  last_active_at TEXT
);
```

## Discord Permissions Required
- **Manage Channels:** create, rename, set limits, delete temp channels
- **Move Members:** move users from generator to temp room
- **View Channels:** inspect configured categories/channels
- **Connect:** validate voice channel behavior
- **Manage Roles / permission overwrites ability:** required for lock/unlock
- **Send Messages:** send responses and embeds
- **Use Application Commands:** slash commands
- **Embed Links:** clean Discord-native UI

## Error Handling Pattern
```ts
async function createTempRoomForMember(member: GuildMember, settings: GuildSettings) {
  try {
    const channel = await tempChannelService.createForMember(member, settings);
    await member.voice.setChannel(channel);
    tempChannelsRepo.insert({
      channelId: channel.id,
      guildId: member.guild.id,
      ownerUserId: member.id,
      categoryId: settings.categoryId,
    });
    logger.info({
      event: 'temp_channel_created',
      guildId: member.guild.id,
      ownerUserId: member.id,
      channelId: channel.id,
    });
    return channel;
  } catch (error) {
    logger.error({
      event: 'temp_channel_create_failed',
      guildId: member.guild.id,
      ownerUserId: member.id,
      error,
    });
    return null;
  }
}
```

Why this pattern matters:
- it keeps Discord API calls inside a service boundary
- it logs failures with enough context to debug later
- it avoids leaving stale database rows behind
- it fails safely instead of guessing

## Discord UI Example
```ts
const panelEmbed = new EmbedBuilder()
  .setTitle('🎛️ Pemucik Control Panel')
  .setDescription('Manage your temporary voice room without leaving Discord.')
  .addFields(
    { name: 'Channel', value: tempChannel.name, inline: true },
    { name: 'Owner', value: `<@${tempChannel.ownerUserId}>`, inline: true },
    { name: 'Status', value: tempChannel.isLocked ? 'Locked' : 'Unlocked', inline: true },
  );

const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
    .setCustomId(`xv:panel:rename:${tempChannel.channelId}`)
    .setLabel('Rename')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId(`xv:panel:lock:${tempChannel.channelId}`)
    .setLabel('Lock')
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId(`xv:panel:unlock:${tempChannel.channelId}`)
    .setLabel('Unlock')
    .setStyle(ButtonStyle.Secondary),
);
```

Why this example exists:
- keep the MVP Discord-native
- use predictable component IDs
- let handlers validate DB ownership before any destructive action

## Deployment Summary
- **Host:** small Linux VPS
- **Install:** Node.js LTS, git, sqlite3
- **Build:** `npm run build`
- **Register commands:** `npm run commands:register`
- **Run:** `pm2 start dist/index.js --name pemucik`
- **Persist PM2:** `pm2 save` and `pm2 startup`
- **Backup:** daily SQLite backup script

## Budget Constraints
- **Development infra:** effectively $0 incremental
- **Production MVP:** about $4–8/month on a small VPS
- **Hard ceiling:** under $10/month

## Naming Conventions
- **Files:** camelCase for most TypeScript modules, matching the design examples
- **Classes / types / builders:** PascalCase
- **Functions / variables:** camelCase
- **Constants / env vars:** UPPER_SNAKE_CASE
- **Custom IDs:** stable prefixes like `xv:panel:action:channelId`

## High-Risk Areas
- Deleting channels without checking `temp_channels`
- Wiping unrelated permission overwrites during unlock
- Leaving stale DB rows after Discord API failures
- Creating multiple rooms for the same user
- Ignoring cooldowns or rate limits
