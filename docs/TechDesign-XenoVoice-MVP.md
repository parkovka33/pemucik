# Technical Design Document: XenoVoice MVP

Historical note:
This technical design describes the original MVP baseline.
The live repository now includes post-MVP control expansion and stabilization work, so treat this document as the architectural foundation rather than the exact current command inventory.
Use [README.md](/home/xenovoicik/xenovoice/README.md) and [MEMORY.md](/home/xenovoicik/xenovoice/MEMORY.md) when you need the latest active surfaces and priorities.

## 1. Overview

**App Name:** XenoVoice  
**Version:** MVP 1.0  
**Platform:** Discord only  
**Target Builder Level:** Vibe-coder / solo founder using AI agents  
**Primary Build Style:** AI writes code; founder guides, tests, reviews, and learns enough to maintain it  
**Timeline:** 1–2 weeks  
**Hosting Budget:** Up to $10/month  
**Website:** Not required for MVP  
**Custom Domain:** Not required for MVP  
**AI Product Features:** Not included in MVP  

XenoVoice is a Discord bot that creates temporary voice channels on demand. A server admin sets up one “Join to Create” voice channel. When a member joins it, the bot creates a temporary voice room, moves the member into it, assigns ownership, gives the owner basic controls, and deletes the channel after it becomes empty.

The MVP goal is not to build the most advanced temporary voice bot. The goal is to build a reliable, safe, understandable, Discord-native bot that proves the core loop works in real servers.

---

## 2. Recommended Approach

### Primary Recommendation: Node.js + TypeScript + discord.js v14 + SQLite + Small VPS

This is the best stack for XenoVoice because it matches the PRD, your previous Discord bot experience, a hosting budget under $10/month, and the need for AI agents to generate understandable code.

**Recommended stack:**

| Area | Choice |
|---|---|
| Runtime | Node.js LTS |
| Language | TypeScript |
| Discord Library | discord.js v14 |
| Database | SQLite |
| SQLite Library | better-sqlite3 |
| Hosting | Small VPS |
| Process Manager | PM2 |
| Logs | Console logs + file logs |
| Monitoring | Free uptime monitor |
| Dashboard | None — Discord commands only |

### Why this is the best fit

1. **You already know the ecosystem a little.**  
   You have built a Discord moderation bot with discord.js v14 before. That makes this safer than switching to Python, Go, Firebase, or a no-code builder.

2. **discord.js fits the product shape.**  
   XenoVoice needs event-driven logic: listen for voice state updates, create channels, move users, edit permission overwrites, and respond to slash commands/buttons/modals. discord.js gives a high-level Node.js interface for Discord API objects and interactions.

3. **SQLite is enough for the MVP.**  
   XenoVoice only needs lightweight state: guild settings, generator channel IDs, temporary channel mappings, owner IDs, cooldowns, and metrics. A separate hosted database would increase cost and complexity without enough MVP benefit.

4. **A small VPS fits the budget.**  
   The PRD target is about $4–8/month for hosting, with SQLite on the same server and no paid database. That is realistic for a small Discord bot MVP.

5. **It is AI-agent friendly.**  
   TypeScript, discord.js, SQLite, and PM2 are common enough that Claude Code, Codex, ChatGPT, Windsurf, and Cursor-style agents can generate and debug them effectively.

---

## 3. Alternative Options Compared

| Option | Pros | Cons | Cost | Time to MVP | Fit |
|---|---|---|---:|---:|---|
| **Node.js + TypeScript + discord.js + SQLite + VPS** | Matches your experience; cheap; reliable; good AI support; simple deployment | Requires basic VPS setup; you still need to understand logs and env vars | ~$4–8/month | 1–2 weeks | **Best** |
| Node.js + JavaScript + discord.js + JSON file | Fastest prototype; fewer TypeScript concepts | Easier to create bugs; JSON can corrupt; harder to maintain safely | ~$4–8/month | 1 week | Good only for throwaway prototype |
| Python + discord.py + SQLite + VPS | Clean language; good bot ecosystem | You already have discord.js experience; AI may need to rewrite more from scratch | ~$4–8/month | 2–3 weeks | Not recommended |
| Supabase/Firebase backend + bot | Easier cloud dashboard; hosted DB | Extra external service; more moving parts; may exceed budget later | $0–25+/month | 2–3 weeks | Overkill for MVP |
| Railway/Render/PaaS hosting | Easier deploy than VPS | Always-on bot may be less predictable on free tiers; pricing can exceed $10 | Varies | 1–2 weeks | Possible, but budget-risky |
| No-code bot builder | Fast for simple commands | Not suited for voice-state automation, channel permissions, cleanup safety | Varies | Unknown | Not recommended |

### Recommendation

Use **Node.js + TypeScript + discord.js v14 + SQLite + VPS**.

### Trade-off

This is not the absolute easiest setup. A pure hosted platform might feel easier at first. But for XenoVoice, the VPS approach gives the best balance of cost control, Discord event reliability, database simplicity, and long-term maintainability.

---

## 4. Key Technical Assumptions

### Discord-native UI is feasible

XenoVoice can use slash commands, message components, and modals for setup and owner controls. Discord interactions support commands, component clicks, and modal submissions, which fits `/setup`, `/panel`, rename modal, and user-limit modal.

### Voice event handling is feasible

The bot needs Gateway events to detect when users join or leave voice channels. discord.js exposes voice-state update types, and Discord’s Gateway is the correct mechanism for receiving real-time events.

### Channel editing and permission overwrites are feasible

Discord supports channel resources, voice channel fields, and permission overwrites. Lock/unlock must be implemented carefully because modifying overwrites requires the right bot permissions and must not break admin access.

### Rate limits must be respected

Discord applies rate limits per route and globally. XenoVoice should not repeatedly create, edit, or delete channels without cooldowns, retries, and error handling.

---

## 5. Architecture Overview

### High-Level Flow

```text
Discord Server
   |
   | User joins "Join to Create" voice channel
   v
Discord Gateway Event: voiceStateUpdate
   |
   v
XenoVoice Bot
   |
   | 1. Check guild settings
   | 2. Check if joined channel is the generator
   | 3. Check cooldown / existing temp channel
   | 4. Create temp voice channel
   | 5. Move user into temp channel
   | 6. Save owner/channel mapping in SQLite
   v
Temporary Voice Channel
   |
   | User leaves; channel becomes empty
   v
Cleanup Worker
   |
   | Wait 5–10 seconds
   | Re-check channel is still empty
   | Confirm channel exists in temp_channels table
   | Delete channel
   | Remove database row
```

### Core Design Principle

**Never trust Discord state alone.**  
Before deleting or editing a channel, XenoVoice should confirm the channel exists in the SQLite `temp_channels` table. This prevents accidental deletion of normal server channels.

---

## 6. Project Structure

```text
xenovoice/
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
│   └── xenovoice.sqlite
├── logs/
│   └── app.log
├── docs/
│   ├── TROUBLESHOOTING.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md
```

### Why this structure works for you

This structure avoids one giant bot file. Each feature has a clear place. That helps AI agents make targeted edits and helps you understand what changed.

---

## 7. Environment Variables

Create `.env` locally and on the VPS.

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=optional_test_guild_id_for_dev_commands

DATABASE_PATH=./data/xenovoice.sqlite
LOG_LEVEL=info
NODE_ENV=production

SUPPORT_SERVER_URL=https://discord.gg/your-support-server
DONATION_URL=https://ko-fi.com/your-page
```

### Security rule

`.env` must never be committed to GitHub.

Add this to `.gitignore`:

```gitignore
.env
data/*.sqlite
data/*.sqlite-shm
data/*.sqlite-wal
logs/*.log
backups/
node_modules/
dist/
```

---

## 8. Discord Permissions

### Required Bot Permissions

| Permission | Why Needed |
|---|---|
| Manage Channels | Create, rename, set limits, and delete temporary voice channels |
| Move Members | Move users from generator channel into their temp channel |
| View Channels | See configured categories/channels |
| Connect | Validate voice channel access |
| Manage Roles / permission overwrites ability | Needed for lock/unlock channel overwrites |
| Send Messages | Send help/setup/panel responses |
| Use Application Commands | Enable slash commands |
| Embed Links | Send clean embeds |

### Important permission warning

Lock/unlock should only modify the specific overwrite needed for `@everyone` or the relevant member role. It must not erase unrelated overwrites. Discord channel permission overwrites are powerful, and the bot can only allow/deny permissions it has authority over.

---

## 9. Database Design

### Recommended Database: SQLite

SQLite is recommended for MVP because:

- No external database account.
- No extra monthly cost.
- Easy to inspect.
- Easy to back up.
- Enough for lightweight guild settings and channel mappings.
- Good fit for a single-instance Discord bot.

For Node.js, use `better-sqlite3` because it is simple and commonly used for synchronous SQLite operations in Node.

### Schema

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

### Backup Strategy

SQLite should be backed up daily. For MVP, a simple daily file backup script is acceptable if writes are low, but later you can improve it using a proper SQLite backup approach.

Example backup script:

```bash
#!/usr/bin/env bash
set -e

mkdir -p backups
timestamp=$(date +"%Y-%m-%d_%H-%M-%S")

sqlite3 data/xenovoice.sqlite ".backup 'backups/xenovoice-$timestamp.sqlite'"

find backups -type f -mtime +14 -delete
```

---

## 10. Core Features

## Feature 1: Join-to-Create Temporary Voice Channel

### Complexity

Medium.

### Goal

When a user joins the configured generator channel, XenoVoice creates a new temporary voice channel and moves the user into it.

### Flow

```text
voiceStateUpdate(oldState, newState)
  |
  | If user joined a voice channel:
  v
Check if new channel ID equals guild generator_channel_id
  |
  | If yes:
  v
Check cooldown
Check if user already owns a temp channel
Check max temp channel limit
Create new voice channel in configured category
Move user into new channel
Save temp channel mapping
Increment metrics
```

### Important edge cases

| Edge Case | Handling |
|---|---|
| User already owns a temp channel | Move them to existing channel or send friendly error |
| User joins/leaves too fast | Re-check member voice state before moving |
| Bot lacks Manage Channels | Log and tell admin via setup/help response |
| Bot lacks Move Members | Create fails safely; no broken DB row |
| Category deleted | Ask admin to rerun `/setup` |
| Discord API rate limited | Let discord.js handle low-level REST behavior; avoid repeated manual retries |
| Too many channels | Enforce per-server max temp channel limit |

### AI prompt to build this feature

```text
Implement the XenoVoice Join-to-Create flow in discord.js v14 + TypeScript.

Requirements:
- Listen to voiceStateUpdate.
- If a member joins the guild's configured generator channel, create a new voice channel in the configured category.
- Move the member into the new channel.
- Store channel_id, guild_id, owner_user_id, category_id in SQLite.
- Prevent duplicate channels for the same owner.
- Add a per-user cooldown.
- If any Discord API call fails, log a clear error and avoid leaving stale database rows.
- Never delete or edit channels that are not in the temp_channels table.
```

---

## Feature 2: Auto-Delete Empty Temporary Channels

### Complexity

Medium.

### Goal

When a temporary channel becomes empty, wait 5–10 seconds, re-check, then delete only if it is still empty and exists in the `temp_channels` table.

### Flow

```text
voiceStateUpdate
  |
  | User leaves/moves from old voice channel
  v
Check if old channel is in temp_channels table
  |
  | If yes:
  v
Wait cleanup delay
Fetch channel again
Check channel still exists
Check channel still has 0 non-bot members
Delete channel
Remove database row
Increment metrics
```

### Safety rule

The cleanup service must use this order:

1. Check database row exists.
2. Fetch Discord channel.
3. Check channel type is voice/stage-compatible if needed.
4. Check member count is zero.
5. Delete.
6. Remove database row.

Never delete just because a channel name “looks like” a XenoVoice channel.

---

## Feature 3: Channel Ownership

### Complexity

Easy/Medium.

### Goal

The creator of the temporary channel becomes the owner. Only owner or admin can control it.

### Rules

| Action | Owner | Admin | Other User |
|---|---:|---:|---:|
| Rename | Yes | Yes | No |
| Lock | Yes | Yes | No |
| Unlock | Yes | Yes | No |
| Set limit | Yes | Yes | No |
| Delete via cleanup | Automatic | Automatic | No |

### Admin override

An admin override should check for a Discord permission such as Manage Channels or Administrator. Avoid hardcoding user IDs.

### AI prompt

```text
Create an ownershipService for XenoVoice.

Requirements:
- findTempChannelByOwner(guildId, userId)
- findTempChannelByChannelId(channelId)
- canControlChannel(interactionUser, guildMember, tempChannel)
- Owner can control their channel.
- Members with Manage Channels or Administrator can override.
- Return friendly error messages for non-owners.
```

---

## Feature 4: Discord-Native Control Panel

### Complexity

Medium.

### Goal

`/panel` sends a control panel embed with buttons for owner controls.

Discord supports application commands and message components, and component interactions are delivered back to the app when users click them. This fits the XenoVoice control panel model.

### Panel design

```text
🎛️ XenoVoice Control Panel

Channel: Viktoria's Room
Owner: @Viktoria
Status: Unlocked
User Limit: No limit

Use the buttons below to manage your room.

[Rename] [Lock] [Unlock]
[Set Limit] [Refresh]
```

### Buttons

| Button | Behavior |
|---|---|
| Rename | Opens modal |
| Lock | Denies Connect for normal members |
| Unlock | Restores normal Connect behavior |
| Set Limit | Opens modal or select menu |
| Refresh | Rebuilds panel embed |

### Component ID pattern

Use predictable custom IDs:

```text
xv:panel:rename:<channelId>
xv:panel:lock:<channelId>
xv:panel:unlock:<channelId>
xv:panel:setlimit:<channelId>
xv:panel:refresh:<channelId>
```

### Security note

Every button handler must validate:

1. The channel exists in DB.
2. The user is owner or admin.
3. The Discord channel still exists.
4. The bot has permission to perform the action.

---

## Feature 5: Rename Channel

### Complexity

Easy.

### Validation

| Rule | Reason |
|---|---|
| Name cannot be empty | Avoid invalid API request |
| Max 32–50 chars for MVP | Keep names readable |
| Strip excessive whitespace | Avoid messy names |
| Block obvious abuse terms later | Not MVP unless needed |
| Rate-limit renames | Avoid API spam |

### Flow

```text
Button click: Rename
  |
  v
Open modal
  |
  v
Modal submit
  |
  v
Validate owner/admin
Validate name
Edit channel name
Update panel
Increment metric
```

Discord modals are form-like overlays that can collect text input and submit it back to the app, which fits channel renaming.

---

## Feature 6: Lock / Unlock

### Complexity

Medium.

### Recommended MVP behavior

Lock should prevent normal members from joining, but should not block admins or the bot.

### Lock implementation

Set a permission overwrite on the temporary voice channel for the server’s `@everyone` role:

```text
Connect: false
```

### Unlock implementation

Remove only the specific deny for `Connect` that XenoVoice added, or restore to neutral if safe.

### Important trade-off

Permission overwrites are one of the riskiest parts of this bot. The simple approach is to modify `@everyone` connect permission. The safer approach is to store the previous overwrite state before locking and restore it on unlock. The safer approach is slightly more work but better for real servers.

### Recommendation

For MVP, implement this:

1. Before lock, read current `@everyone` overwrite for the temp channel.
2. Save previous state in memory or DB if needed.
3. Apply deny `Connect`.
4. On unlock, remove the deny created by XenoVoice without touching unrelated overwrites.

---

## Feature 7: Set User Limit

### Complexity

Easy.

### MVP options

| Option | Pros | Cons |
|---|---|---|
| Modal with number input | Flexible; easy to implement | User can type invalid values |
| Select menu: no limit / 2 / 5 / 10 | Safer; fewer errors | Less flexible |
| Both | Best UX | More code |

### Recommendation

Use a **select menu first** if you want fewer bugs. Use modal later for custom values.

MVP options:

```text
No limit
2 users
5 users
10 users
```

Voice channel objects support a `user_limit` field, which matches this feature.

---

## Feature 8: `/setup`

### Complexity

Medium.

### MVP setup should be simple

Do not build the full fancy dropdown setup first. For the first MVP, use a simple `/setup` command that creates the category and generator channel automatically.

### Command behavior

```text
/setup
  |
  | Admin only
  v
Check bot permissions
Create or reuse category: XenoVoice
Create or reuse voice channel: ➕ Join to Create
Save guild_settings
Send success embed
```

### Setup success embed

```text
✅ XenoVoice is ready!

Users can now join:
➕ Join to Create

I will create temporary voice channels automatically.
```

### Why postpone fancy setup

Dropdown category selection and custom setup screens are nice, but they add interaction complexity. The first version should prove the core voice channel loop.

---

## Feature 9: `/help` and `/support`

### `/help`

Should explain:

- How admins run `/setup`
- How users create rooms
- How owners use `/panel`
- Common permission issues

### `/support`

Should include:

- Support server link
- Donation link
- Short free-first message

### Tone

Friendly, clear, non-corporate, no aggressive upsell.

---

## 11. Error Handling Strategy

### Friendly errors

| Situation | User-facing message |
|---|---|
| Missing Manage Channels | “I need Manage Channels to create and clean up voice rooms.” |
| Missing Move Members | “I can create the room, but I need Move Members to place users inside it.” |
| Generator missing | “I can’t find the Join-to-Create channel. Please ask an admin to run `/setup` again.” |
| User not owner | “Only the room owner or a server admin can use this control.” |
| Channel already deleted | “This temporary room no longer exists.” |
| Cooldown active | “Please wait a few seconds before creating another room.” |
| Rate limit / Discord API issue | “Discord is asking me to slow down. Please try again shortly.” |

### Logging format

Use structured logs:

```json
{
  "level": "info",
  "event": "temp_channel_created",
  "guildId": "123",
  "ownerUserId": "456",
  "channelId": "789",
  "timestamp": "2026-05-04T12:00:00Z"
}
```

### What to log

- Bot startup
- Command registration
- `/setup` success/failure
- Temp channel creation success/failure
- Move member failure
- Auto-delete success/failure
- Permission errors
- Rate-limit-like API errors
- Unhandled exceptions

---

## 12. Safety and Abuse Controls

### Required MVP safeguards

| Risk | MVP Mitigation |
|---|---|
| User spams channel creation | Per-user cooldown |
| One user creates many rooms | One active temp channel per owner |
| Too many temp channels | Per-server max temp channel limit |
| Bot deletes wrong channel | Delete only if channel exists in `temp_channels` table |
| Bot breaks permissions | Only edit specific overwrites; never clear all overwrites |
| SQLite file loss | Daily backup |
| Bot token leak | `.env`, `.gitignore`, no screenshots of tokens |
| User joins/leaves too fast | Re-check voice state before move/delete |
| API spam | Cooldowns and no retry loops |

### Recommended MVP limits

```text
Per-user create cooldown: 10 seconds
Per-user rename cooldown: 10 seconds
Cleanup delay: 7 seconds
Max temp channels per guild: 25
One temp channel per user: yes
```

---

## 13. Development Setup

### Required local tools

| Tool | Purpose |
|---|---|
| VS Code or Windsurf | Editing and AI-assisted coding |
| Claude Code / Codex / ChatGPT | Planning, implementation, debugging |
| Node.js LTS | Runtime |
| Git | Version control |
| SQLite CLI | Inspecting and backing up DB |
| Discord Developer Portal | Bot application and token |

Use a production-ready Node.js LTS release. Node’s official release page says production applications should use Active LTS or Maintenance LTS releases.

### Initial commands

```bash
mkdir xenovoice
cd xenovoice

npm init -y

npm install discord.js dotenv better-sqlite3
npm install -D typescript tsx @types/node eslint prettier

npx tsc --init
```

### package.json scripts

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

---

## 14. AI Assistance Strategy

### Recommended workflow

| Task | Best Tool | How to use it |
|---|---|---|
| Architecture decisions | ChatGPT / Claude | Ask for trade-offs and risk review |
| Code implementation | Claude Code / Codex / Windsurf | Give one small feature at a time |
| Debugging | ChatGPT / Claude Code | Paste exact error, relevant file, expected behavior |
| Refactoring | Claude Code | Ask it to simplify, not redesign |
| Code explanation | ChatGPT | Ask for “explain this file like I’m learning” |
| Testing checklist | ChatGPT | Ask for manual Discord test cases |

### Agent rule

Never ask AI to “build the whole bot” in one prompt.

Ask for one feature at a time:

1. Create DB schema.
2. Add `/setup`.
3. Add voice state handler.
4. Add temp channel creation.
5. Add cleanup.
6. Add `/panel`.
7. Add rename.
8. Add lock/unlock.
9. Add set limit.
10. Add deployment docs.

### Prompt template: feature implementation

```text
We are building XenoVoice, a Discord-only temporary voice channel bot.

Stack:
- Node.js
- TypeScript
- discord.js v14
- SQLite with better-sqlite3

Please implement only this feature:
[feature name]

Requirements:
- [requirement 1]
- [requirement 2]
- [requirement 3]

Constraints:
- Keep files small.
- Add comments to complex logic.
- Do not change unrelated files.
- Preserve existing behavior.
- Include manual test steps.
```

### Prompt template: explain code

```text
Explain this file in simple terms.

I want to understand:
1. What this file is responsible for.
2. Which functions are most important.
3. What could break.
4. What I should check if this feature stops working.

Code:
[paste file]
```

### Prompt template: debugging

```text
I am building XenoVoice with discord.js v14 and TypeScript.

Expected behavior:
[what should happen]

Actual behavior:
[what happened]

Error/log:
[paste exact error]

Relevant code:
[paste code]

Please:
1. Explain the likely cause.
2. Suggest the smallest safe fix.
3. Tell me how to test it.
4. Avoid rewriting unrelated code.
```

---

## 15. Build Roadmap: 1–2 Weeks

### Day 1 — Project Setup

- Create GitHub repo.
- Initialize Node.js + TypeScript.
- Install discord.js and SQLite library.
- Create Discord application and bot.
- Add `.env`.
- Add basic login.
- Log `XenoVoice online`.

### Day 2 — Slash Commands

Build:

- `/help`
- `/setup`
- `/panel`
- `/support`

Acceptance:

- Commands register.
- Bot responds.
- Admin-only commands check permissions.

### Day 3 — SQLite

Build:

- Schema.
- Migration script.
- Repositories.
- Basic metrics.

Acceptance:

- DB file is created.
- Tables exist.
- Can save and read guild settings.

### Day 4 — `/setup`

Build:

- Permission check.
- Create category.
- Create Join-to-Create channel.
- Save settings.
- Success embed.

Acceptance:

- New admin can run `/setup`.
- Generator channel appears.
- Settings persist after restart.

### Day 5 — Voice State Handler

Build:

- Detect joins to generator.
- Create temp channel.
- Move user.
- Store owner mapping.
- Cooldown.
- One room per user.

Acceptance:

- User joins generator.
- Temp channel is created.
- User is moved.
- DB row exists.

### Day 6 — Auto-Delete

Build:

- Detect empty temp channel.
- Wait 7 seconds.
- Re-check.
- Delete only if DB row exists.
- Remove DB row.

Acceptance:

- Empty temp channel disappears.
- Normal channels are not touched.
- Manual deletion does not crash bot.

### Day 7 — `/panel`

Build:

- Owner/admin permission check.
- Embed.
- Buttons.
- Refresh.

Acceptance:

- Owner can open panel.
- Non-owner gets friendly error.
- Admin can override.

### Day 8 — Rename and User Limit

Build:

- Rename modal.
- Name validation.
- Limit select menu or modal.
- Metrics.

Acceptance:

- Owner can rename.
- Invalid names fail safely.
- Owner can set user limit.

### Day 9 — Lock / Unlock

Build:

- Permission overwrite logic.
- Lock.
- Unlock.
- Avoid breaking admin access.

Acceptance:

- Normal users cannot join locked channel.
- Unlock restores access.
- Admins are not locked out.

### Day 10 — Error Handling

Add friendly errors for:

- Missing Manage Channels.
- Missing Move Members.
- Missing permission overwrite ability.
- Missing category.
- Missing generator channel.
- User left before move.
- API failure.

### Day 11 — Metrics and Support

Track:

- Channels created.
- Creation failures.
- Channels deleted.
- Rename/lock/unlock/limit usage.
- `/support` usage.
- Last active guild.

### Day 12 — VPS Deployment

Deploy with:

- Environment variables.
- Build command.
- PM2.
- Log files.
- Restart on crash.
- Backup script.

PM2 is designed as a production process manager for Node.js apps and supports process lists, background execution, startup scripts, and monitoring-style process management.

### Day 13 — Real Server Testing

Test on 2–5 servers:

- Invite bot.
- Run `/setup`.
- Join generator.
- Rename.
- Lock.
- Unlock.
- Set limit.
- Leave channel.
- Confirm deletion.
- Restart bot.
- Confirm DB persists.

### Day 14 — Polish

- Improve wording.
- Add `/help`.
- Add `/support`.
- Fix beta bugs.
- Prepare demo GIF.
- Prepare bot listing text later.

---

## 16. Deployment Plan

### Recommended hosting

Use a small Linux VPS under $10/month.

### VPS setup checklist

```bash
# 1. Update server
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js LTS
# Use your preferred official Node install method.

# 3. Install git and sqlite
sudo apt install git sqlite3 -y

# 4. Clone repo
git clone <your-repo-url> xenovoice
cd xenovoice

# 5. Install dependencies
npm ci

# 6. Create .env
nano .env

# 7. Build
npm run build

# 8. Register commands
npm run commands:register

# 9. Start with PM2
pm2 start dist/index.js --name xenovoice

# 10. Save PM2 process list
pm2 save

# 11. Configure startup
pm2 startup
```

### Deployment files

Create `docs/DEPLOYMENT.md` with:

- How to SSH into VPS.
- How to pull latest code.
- How to rebuild.
- How to restart PM2.
- How to view logs.
- How to run backup.
- How to restore backup.

### Useful PM2 commands

```bash
pm2 status
pm2 logs xenovoice
pm2 restart xenovoice
pm2 stop xenovoice
pm2 save
```

---

## 17. Monitoring

### MVP monitoring stack

| Monitoring Need | MVP Solution |
|---|---|
| Bot process alive | PM2 |
| Crash logs | PM2 logs + file logs |
| Uptime signal | Free uptime monitor pinging simple health endpoint or external status command |
| Manual health check | `/help` and log review |
| Database backup | Daily cron backup |

### Optional health check

Since Discord bots do not naturally expose an HTTP server, you can add a tiny health endpoint later:

```text
GET /health
Response: { "ok": true, "uptime": 12345 }
```

For MVP, this is optional. PM2 logs may be enough.

---

## 18. Testing Strategy

### Manual testing is required

Because the core product is Discord voice behavior, manual testing in real Discord servers matters more than unit tests during MVP.

### Core test checklist

| Test | Expected Result |
|---|---|
| Admin runs `/setup` | Category and generator channel created |
| User joins generator | Temp channel created |
| User is moved | User lands in temp channel |
| DB row exists | Channel mapping stored |
| User leaves | Cleanup delay starts |
| Channel empty after delay | Channel deleted |
| DB row removed | No stale mapping |
| User rejoins quickly | No duplicate broken state |
| User already owns room | Bot does not create duplicate |
| Non-owner opens panel | Friendly error |
| Owner renames | Channel name changes |
| Owner locks | Normal users cannot join |
| Owner unlocks | Normal users can join again |
| Owner sets limit | Voice channel limit updates |
| Bot restarts | Existing DB persists |

### Suggested minimal automated tests

Use small unit tests for pure logic:

- `validation.ts`
- `cooldownService.ts`
- `ownershipService.ts`
- `permissionService.ts`
- repository functions

Do not spend too much time mocking all of Discord for MVP.

---

## 19. Troubleshooting Guide

Create `docs/TROUBLESHOOTING.md`.

### Problem: bot is offline

Check:

```bash
pm2 status
pm2 logs xenovoice
```

Likely causes:

- Bad token.
- `.env` missing.
- Node process crashed.
- VPS restarted without PM2 startup configured.

### Problem: `/setup` does not appear

Check:

- Commands registered.
- Correct `DISCORD_CLIENT_ID`.
- Bot invited with applications.commands scope.
- For testing, register guild commands first because they update faster than global commands.

### Problem: bot cannot create channel

Check:

- Bot has Manage Channels.
- Bot role is high enough.
- Category exists.
- Server has not hit channel limits.

### Problem: bot creates room but cannot move user

Check:

- Bot has Move Members.
- User is still in voice.
- Bot role is not blocked by permissions.

### Problem: lock does not work

Check:

- Bot can manage permission overwrites.
- `@everyone` overwrite was applied.
- Other role overwrites are not allowing Connect.
- Admins may still bypass lock, which is expected.

### Problem: bot deletes wrong channel

This should not happen if implemented correctly.

Immediate checks:

- Confirm delete code checks `temp_channels` table first.
- Confirm cleanup does not rely on channel name.
- Confirm manual delete path removes stale DB rows.

---

## 20. Security Plan

### Secrets

- Store bot token only in `.env`.
- Never paste token into AI chat.
- Never commit `.env`.
- Rotate token if leaked.

### Discord permissions

- Request only needed permissions.
- Validate permissions during `/setup`.
- Show friendly missing-permission messages.
- Avoid broad destructive operations.

### Database

- Store only necessary IDs and metrics.
- No message content storage.
- No voice recording.
- No AI processing.
- Daily SQLite backup.
- Keep backups private.

### User data

XenoVoice stores Discord IDs, guild IDs, channel IDs, basic settings, ownership mappings, and simple metrics. It should not store chat content, voice content, private messages, or personal profile data beyond IDs needed for bot functionality.

### Abuse prevention

- Cooldowns.
- One room per user.
- Max rooms per server.
- Safe cleanup.
- Logs for failures.

---

## 21. Cost Breakdown

> Pricing changes often. Verify vendor pricing directly before committing. Last verified for this document: 4 May 2026.

### Development phase

| Service | Cost |
|---|---:|
| AI tools | Covered separately |
| VS Code / Windsurf | Already available |
| GitHub repo | Free tier likely enough |
| Local SQLite | $0 |
| Discord Developer Portal | $0 |
| Total incremental dev infra | $0 |

### Production MVP phase

| Service | MVP Choice | Expected Cost |
|---|---|---:|
| Hosting | Small VPS | ~$4–8/month |
| Database | SQLite on VPS | $0 |
| Domain | None | $0 |
| Website | None | $0 |
| Monitoring | Free/basic | $0 |
| Donation tool | Ko-fi/Patreon/BMC base | $0 base |
| Total | VPS-only MVP | Under $10/month target |

The PRD’s constraint is to keep hosting and infrastructure under $10/month, with no website, no custom domain, and no expensive external database.

---

## 22. Scaling Path

### MVP: 0–10 test servers

Current stack is enough.

Use:

- One VPS.
- SQLite.
- PM2.
- Manual testing.
- Daily backup.

### Early beta: 10–100 servers

Still likely okay.

Add:

- Better logs.
- Error alerts.
- More careful backup.
- Metrics command.
- More cooldown tuning.

### Growth: 100+ active servers

Consider:

- PostgreSQL.
- More robust queueing.
- Better observability.
- Separate staging/prod bots.
- More formal support process.

### Multi-instance bot

SQLite is not enough for multi-instance deployment. If XenoVoice needs horizontal scaling, migrate to PostgreSQL first.

---

## 23. What Not to Build in MVP

Do not build these yet:

- Web dashboard.
- Premium/paywall logic.
- AI features.
- Temporary text channels.
- Multiple generators.
- Claim ownership.
- Transfer ownership.
- Permit/reject users.
- Request-to-join flow for locked rooms.
- Multilingual UI.
- Custom templates.
- Ghost/invisible mode.
- Room status messages.
- Room bitrate controls and default bitrate settings.
- NSFW/age-restricted room toggles when supported.
- Region override controls when supported.
- Persistent `/interface` control channel.
- Advanced `/setup default` configuration and selective `/reset` commands.
- Advanced role-based toggles.

Reason: each adds edge cases. The first MVP should prove the core value: create, control, and clean up temporary voice rooms reliably.

---

## 24. Definition of Technical Success

XenoVoice MVP is technically successful when:

- `/setup` works end-to-end.
- Users can create temporary voice channels by joining the generator.
- Users are moved into their rooms.
- Owners are stored correctly.
- `/panel` works.
- Rename works.
- Lock/unlock works.
- User limit works.
- Empty rooms are deleted safely.
- Normal channels are never deleted.
- Missing permissions produce friendly errors.
- Bot restarts after crash.
- SQLite database persists.
- Daily backup exists.
- Hosting cost stays under $10/month.
- You can inspect logs and understand the most likely failure points.

---

## 25. Final Recommendation

Build XenoVoice as a **single-process Node.js TypeScript Discord bot** using **discord.js v14**, **SQLite**, and a **small VPS**.

The most important engineering principle is:

> Safety before cleverness.

Every destructive action — especially channel deletion and permission editing — must be database-confirmed, permission-checked, logged, and easy to debug.

This stack is not the fanciest, but it is the best fit for the PRD, your experience, your timeline, your budget, and your main worries.

---

## 26. Self-Verification Checklist

| Required Section | Present? |
|---|---|
| Platform/approach clearly chosen | Yes |
| Alternatives compared with pros/cons | Yes |
| Tech stack fully specified | Yes |
| Trade-offs honestly acknowledged | Yes |
| Cost breakdown included | Yes |
| Timeline realistic | Yes |
| AI assistance strategy defined | Yes |
| Security/data risks addressed | Yes |
| Discord-specific feasibility covered | Yes |
| MVP scope protected from feature creep | Yes |

---

## 27. Critical Review Questions

### Does this tech stack match the budget?

Yes. The design avoids external paid databases, dashboards, domains, and paid monitoring. The only required infrastructure cost is the VPS.

### Does the timeline match the complexity?

Yes, if the MVP stays strict: one generator, SQLite, Discord-only UI, no AI features, no web dashboard, no multilingual system yet.

### Are there security concerns?

Yes, mainly bot token handling, permission overwrites, safe deletion, SQLite backup, and accidental destructive actions. The design addresses these with `.env`, `.gitignore`, database-confirmed deletion, cooldowns, logs, backups, and minimal permission edits.

---

## 28. Documents So Far

1. Research findings — Part 1  
2. PRD — what to build — Part 2  
3. Technical Design — how to build it — Part 3  

---

## 29. Next Step

Proceed to **Part 4** to generate the `AGENTS.md` file and tool-specific configuration files that will guide your AI assistant in building the actual code.

---

## 30. Source References

These references were used to verify the technical assumptions and implementation direction:

- XenoVoice PRD, uploaded document, 4 May 2026.
- Discord Developer Docs — Interactions Overview: https://docs.discord.com/developers/interactions/overview
- Discord Developer Docs — Application Commands: https://docs.discord.com/developers/interactions/application-commands
- Discord Developer Docs — Components: https://docs.discord.com/developers/components/reference
- Discord Developer Docs — Channel Resource: https://docs.discord.com/developers/resources/channel
- Discord Developer Docs — Permissions: https://docs.discord.com/developers/topics/permissions
- Discord Developer Docs — Rate Limits: https://docs.discord.com/developers/topics/rate-limits
- discord.js Guide: https://discordjs.guide/
- discord.js Documentation: https://discord.js.org/docs/packages/discord.js
- Node.js Releases / LTS guidance: https://nodejs.org/en/about/previous-releases
- PM2 Documentation: https://pm2.keymetrics.io/docs/usage/quick-start/
- SQLite Backup API: https://sqlite.org/backup.html
