# Code Patterns

## Purpose
This file defines the implementation patterns the agent should follow for XenoVoice.
Prefer these patterns over inventing new ones.

## Architecture Pattern
- **Primary pattern:** Feature-based, service-oriented bot architecture
- **Rule:** Keep command handlers, event handlers, button handlers, and modal handlers thin.
- **Rule:** Put business logic in `services/`.
- **Rule:** Put SQLite persistence in `db/repositories/`.
- **Rule:** Put reusable cross-cutting helpers in `utils/`.
- **Rule:** Reuse existing modules before creating new abstractions.

## Discord Interaction Pattern
- Slash commands define entry points such as `/setup`, `/panel`, `/help`, `/support`, and later `/settings`.
- `interactionCreate` should route incoming command, button, select, and modal interactions to focused handlers.
- Component custom IDs must stay predictable, for example:
  - `xv:panel:rename:<channelId>`
  - `xv:panel:lock:<channelId>`
  - `xv:panel:unlock:<channelId>`
  - `xv:panel:setlimit:<channelId>`
  - `xv:panel:refresh:<channelId>`

## Voice Event Pattern
- Use `voiceStateUpdate` as the authoritative event for generator joins and temp room cleanup.
- When a member joins the configured generator channel:
  - load guild settings
  - confirm the channel is the configured generator
  - check cooldown
  - check whether the user already owns a temp channel
  - check max temp channel limit
  - create the temp voice channel
  - move the member
  - persist the owner/channel mapping
  - increment metrics
- When a member leaves a temp channel:
  - check DB row exists
  - wait cleanup delay
  - re-fetch channel
  - confirm it still exists and is empty
  - delete the channel
  - remove the DB row

## Safety Pattern
- Never trust Discord state alone.
- Before deleting or editing a temp channel, confirm it exists in the SQLite `temp_channels` table.
- Never delete a channel because its name "looks like" a temp channel.
- Never wipe all permission overwrites to implement lock/unlock.
- Only edit the specific overwrite required for the action.

## Ownership and Authorization Pattern
- Owner controls are allowed for:
  - the recorded owner of the temp channel
  - admins with `Manage Channels` or `Administrator`
- All control handlers must validate:
  - DB row exists
  - caller is owner or admin
  - Discord channel still exists
  - bot has permission for the requested action
- Return friendly errors for non-owners and missing permissions.

## Error Handling
- Normalize errors at service or interaction boundaries.
- Never swallow errors silently; always log them.
- Return user-safe messages in Discord responses.
- Log developer context with guild ID, user ID, channel ID, and event type when relevant.
- Avoid leaving stale DB rows after partial Discord API failures.

## Logging Pattern
Use structured logs whenever possible, for example:

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

Always log:
- bot startup
- command registration
- `/setup` success/failure
- temp channel creation success/failure
- move-member failures
- cleanup success/failure
- permission failures
- rate-limit-like Discord errors
- unhandled exceptions

## Validation
- Validate all external inputs:
  - slash command options
  - modal inputs
  - select values
  - environment variables
- Channel rename rules for MVP:
  - name cannot be empty
  - keep names readable
  - strip excessive whitespace
- User limit rules for MVP:
  - allow only known safe values first (`0`, `2`, `5`, `10`) unless custom input is explicitly implemented

## Cooldown Pattern
Recommended MVP limits:
- per-user create cooldown: 10 seconds
- per-user rename cooldown: 10 seconds
- cleanup delay: 7 seconds
- max temp channels per guild: 25
- one temp channel per user: yes

## Database Pattern
- Store guild configuration in `guild_settings`.
- Store active temporary channel ownership in `temp_channels`.
- Store cooldown state in `user_cooldowns` if implemented persistently.
- Store counters and last-active signals in `metrics`.
- DB repository functions should stay small and explicit.

## File and Naming Conventions
- **Files:** match the tech design examples such as `setupService.ts`, `voiceStateUpdate.ts`, `guildSettingsRepo.ts`
- **Components / classes / types:** PascalCase
- **Functions / variables:** camelCase
- **Constants / env vars:** UPPER_SNAKE_CASE

## Testing Pattern
- Add unit tests for pure logic and repository helpers.
- Use manual Discord checks for core voice flows.
- After every feature, run the relevant commands and re-test the exact user flow that changed.
- Fix failures before moving on.

## Change Discipline
- Prefer focused, minimal edits over rewrites.
- Do not introduce new dependencies without checking existing `package.json` expectations first.
- Do not change migrations, deployment, secrets, or destructive cleanup behavior without explicit approval.
- Build one feature at a time in this order: setup, storage, generator flow, cleanup, owner controls, polish, deployment.
