# Testing Strategy

## Testing Philosophy
Manual testing is required for XenoVoice because the core product behavior depends on real Discord voice events, permissions, member movement, and channel state. For the MVP, real Discord verification matters more than building a large mocked test suite.

## Frameworks
- **Unit Tests:** No framework is explicitly mandated yet in the source documents. Add a lightweight TypeScript-friendly unit test runner later for pure logic only.
- **E2E Tests:** Not recommended for early MVP because mocking end-to-end Discord voice behavior would add complexity with limited payoff.
- **Manual Checks:** Required and primary for all core voice flows.

## What Should Be Unit Tested
Add small automated tests only for pure logic such as:
- `validation.ts`
- `cooldownService.ts`
- `ownershipService.ts`
- `permissionService.ts`
- repository helper functions

Do not spend too much time mocking all of Discord for MVP.

## Manual Verification Loop
Run this loop after each feature and fix failures before moving on:

1. Start the bot locally.
2. Register commands if command definitions changed.
3. Use a test Discord server.
4. Trigger the feature manually.
5. Check Discord behavior.
6. Check logs.
7. Check SQLite state if relevant.
8. Restart the bot if persistence matters.
9. Re-test the same flow.

## Core Manual Checklist
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

## Focused Stabilization Pass
Use this staged checklist for the current post-MVP validation tail. Run it in order and do not start the next feature milestone until all critical failures here are understood.

### Preflight
1. Run `npm run lint`.
2. Run `npm run build`.
3. Run `npm run db:migrate` on the same database the bot will use for the Discord pass.
4. Run `npm run commands:register` if the slash schema changed since the last live pass.
5. Start the bot with `npm run dev`.
6. Test in a server where the bot effectively has `Administrator` while you validate product behavior first; do a stricter permission pass only after the main flows are green.

### Stage 1: `/voice` Live Pass
Prepare:
- One fresh temp room owned by the tester.
- One second normal member account.
- One admin role other than `@everyone`.
- One ordinary non-temp voice channel kept untouched as a safety canary.

Verify these subcommands:
- `/voice lock`: new members cannot join; owner, bot, and admin role still can.
- `/voice unlock`: the room opens again, and any pre-existing non-XenoVoice overwrite on `@everyone` is not erased.
- `/voice claim`: a member inside the room can claim only when the previous owner is absent; `temp_channels.owner_user_id` changes to the claimant.
- `/voice ghost`: room becomes hidden to ordinary members, but owner, bot, and admin role still keep visibility.
- `/voice unghost`: room becomes visible again without breaking admin visibility afterward.
- `/voice bitrate bitrate:<valid>`: bitrate changes and respects the guild max.
- `/voice nsfw toggle:true|false`: the NSFW flag flips correctly.
- `/voice transfer user:<member in room>`: ownership moves only to a real member currently in the same room.
- `/voice region region:<value>`: `auto` and at least one explicit region both apply cleanly.
- `/voice status status:<text>`: the custom room status updates through the raw REST-backed path.

Safety assertions during Stage 1:
- `unlock` must clear only the XenoVoice-managed `Connect` deny on `@everyone`; unrelated allows/denies must survive.
- `ghost` and `unghost` must not remove admin access or bot visibility.
- `/voice ...` commands must fail cleanly on ordinary users without touching non-temp voice channels.
- The normal non-temp canary voice channel must remain unchanged in Discord and absent from `temp_channels`.

Suggested DB spot checks during Stage 1:
- `SELECT channel_id, owner_user_id, is_locked, user_limit FROM temp_channels;`
- After `claim` or `transfer`, confirm the `owner_user_id` row changed for the same `channel_id`.
- Confirm no row exists for the non-temp canary channel.

### Stage 2: `/setup` Live Pass
Use a clean server or deliberately reset the test category layout first.

Verify:
- `/setup editable:true`: a newly created temp-room owner gets native Discord editing capability (`Manage Channels`) in the room.
- `/setup editable:false`: a newly created temp-room owner can still use XenoVoice controls but does not receive native channel-edit rights.
- `/setup category:<custom category>`: the generator and future temp rooms land in the selected category, not the old default one.
- `/setup permission:category`: a new temp room inherits category-level permissions and does not mirror extra generator-only overwrites.
- `/setup permission:generator`: a new temp room clones the generator overwrites, including deliberate custom non-default overwrites used for the test.

Stage 2 safety assertions:
- Rerunning `/setup` must preserve unrelated persisted defaults already stored in `guild_settings`, especially interface metadata and bitrate defaults.
- The bot must still only create temp rooms inside the configured category from SQLite.

Suggested DB spot checks during Stage 2:
- `SELECT guild_id, category_id, generator_channel_id, editable_by_owner, permission_source, interface_channel_id, interface_message_id FROM guild_settings;`
- Confirm `editable_by_owner` and `permission_source` match the latest `/setup` run.

### Stage 3: `/interface` Live Pass
Verify:
- First `/interface`: creates or reuses the dedicated text channel and posts a single persistent interface message.
- Second `/interface`: refreshes the same channel/message instead of duplicating them.
- `/setup` category change followed by `/interface`: reuse/recreation still feels clean and the saved metadata points at the correct live channel.
- `invite` edge case: closed DMs returns the fallback invite URL privately instead of failing hard.
- `claim` edge case: a non-owner inside an abandoned temp room can claim through the interface, but not while the owner is still present.
- `admin` edge case: server admin can operate the interface against a tracked temp room without becoming the owner unless they explicitly claim/transfer.

Stage 3 safety assertions:
- Interface actions must resolve by tracked temp-room ownership first and should not accidentally target an unrelated current voice channel.
- Reused interface messages must stay single-instance and private responses must remain ephemeral.

### Exit Rule Before New Feature Work
Only start the next code milestone after:
- Stage 1, Stage 2, and Stage 3 all pass or have explicit documented failures.
- Any newly found behavior gaps are written into `MEMORY.md`.
- The next feature scope is still ordered as `/voice text` first, `/voice lfm` second, `/voice game` last unless a live-pass result changes that priority.

## Linked Text Live Pass
Use this checklist specifically for the new `/voice text` milestone after local migration, build, test, and command registration are already green.

### Preflight
1. Run `npm run db:migrate`.
2. Run `npm run commands:register`.
3. Start the bot with `npm run dev`.
4. Prepare one tracked temp room owner, one second normal member, and one admin role.

### `/voice text` Checks
- `/voice text` creates one linked text channel for the tracked temp room.
- A second `/voice text` call reuses the same linked text channel instead of duplicating it.
- The linked text channel is placed under the same category as the temp voice room.
- The linked text channel is visible to the owner, the bot, and admins.
- A second member who joins the voice room gains access to the linked text channel.
- A member who leaves the voice room loses access to the linked text channel shortly after the voice-state update.
- `/voice claim` or `/voice transfer` keeps the linked text channel usable for the new owner.
- Renaming the voice room also updates the linked text channel name.
- If the linked text channel is deleted manually, `/voice text` recreates it cleanly and updates the SQLite mapping.
- When the tracked voice room becomes empty and is deleted, the linked text channel is also deleted.

### `/voice text` SQL Spot Checks
- `SELECT text_channel_id, voice_channel_id, guild_id FROM temp_text_channels;`
- After the first `/voice text`, exactly one row exists for the tracked `voice_channel_id`.
- After manual deletion plus recreation, the same `voice_channel_id` points to the new `text_channel_id`.
- After voice-room cleanup, no row remains for that `voice_channel_id`.

## Safety-Focused Regression Checks
Always verify these after touching cleanup, permissions, or ownership logic:
- the bot never deletes a channel unless it exists in `temp_channels`
- the bot does not delete normal voice channels
- unlock does not wipe unrelated permission overwrites
- admins are not accidentally locked out
- failed Discord API calls do not leave stale DB rows
- one user cannot create many active temp channels
- cooldowns prevent spammy create/rename loops

## Pre-Commit / Pre-Checkpoint Checks
Before marking work complete, run as many of these as the current scaffold supports:
- `npm run lint`
- `npm run build`
- `npm run commands:register` when command definitions changed
- `npm run db:migrate` when DB schema or migration code changed
- manual Discord verification for the touched feature

There is no documented pre-commit hook setup yet. If hooks are introduced later, keep lint/build/test checks inside them.

## Failure Handling Rule
Never skip verification because a change looks simple. If a check fails:
- identify the root cause
- fix it before continuing
- update `MEMORY.md` if the failure reveals an important project constraint or quirk

## Recommended Discord Test Environments
- 1 personal/private server for fast iteration
- 2–5 friendly community servers for real behavior validation during private testing

## Deployment Verification
Before calling the MVP stable on a VPS, verify:
- bot starts under PM2
- bot restarts after crash or reboot
- slash commands are registered
- `.env` is not committed
- SQLite persists across restarts
- logs can be inspected
- backup flow exists and is understandable
