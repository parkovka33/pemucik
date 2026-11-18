# System Memory & Context 🧠
 <!--
 AGENTS: Update this file after every major milestone, structural change, or resolved bug.
 DO NOT delete historical context if it is still relevant. Compress older completed items.
 -->

## 🏗️ Active Phase & Goal
**Current Task:** Post-MVP stabilization with the local Piper `/voice tts` recovery implemented and awaiting a prepared-host disposable-guild verification pass.
**Next Steps:**
1. Prepare a Node 24 disposable host with Piper, the chosen model, FFmpeg, working UDP, and the Discord Message Content privileged intent.
2. Run the `/voice tts` checklist in `agent_docs/testing.md`, retaining full connection/close-code evidence if voice does not reach Ready.
3. Rehearse migrations against a restored production-shaped database copy and complete the existing protected-remediation disposable-guild gates.
4. Do not treat TTS as production-verified or broaden its scope until the audible live pass succeeds.

## 📌 Current Critical Context
- REM-003, REM-005, REM-006, and REM-012 are implemented locally under explicit authorization. They pass mocked Discord and temporary-SQLite failure tests but are not production-ready until disposable-guild and production-shaped-copy gates pass.
- Database migrations now have an ordered `schema_migrations` ledger, per-migration transactions, known-schema validation, integrity/foreign-key checks, backup restoration coverage, and a duplicate-safe unique `(guild_id, owner_user_id)` index migration.
- Join-to-Create now persists and confirms the room before moving the member. Compensation requires the exact tracked record; an untracked persistence failure is logged and never auto-deleted.
- Cleanup now preserves the parent row, linked text mapping, and persisted TTS settings when child deletion is uncertain, while active playback stops and later recovery retries idempotently.
- Lock and ghost now read fresh state, fail closed on owner/bot denies, distinguish Administrator from ManageChannels, apply the broad deny last, verify access, and roll back only managed bits.
- `/voice tts` is restored in the slash builder and execution path. Startup registers `messageCreate`, and the client requests `GuildMessages` plus privileged `MessageContent`.
- TTS intake uses native voice-channel chat first and stored linked temporary text channels as a legacy fallback. The author must be connected to the exact DB-tracked room; a three-second user cooldown plus five-message room and twenty-message guild queues bound work.
- Enabling TTS now fails closed until Piper, the selected readable model, FFmpeg, and Opus support pass runtime inspection. Active synthesis/playback is cancelled on disable/delete/shutdown, Piper is limited to 30 seconds, and partial WAV files are removed.
- `temp_tts_settings` partial upserts preserve omitted fields. No migration or schema change was required.
- The old live failure remains historical evidence: `signalling -> connecting(code 0/1, endpoint assigned) -> signalling(code 6)` occurred before UDP-ready and before audio conversion. The exact cause is unconfirmed; current `@discordjs/voice` 0.19.2 includes DAVE support, but live UDP/voice behavior still needs validation.
- `docs/tts-investigation.md` is the source of truth for recovery evidence, host prerequisites, dependency decisions, and the remaining live boundary.
- Empty tracked temp rooms now clean up immediately after the last member leaves; the previous grace delay is set to `0ms`.
- `/voice text` has been removed from the active slash/help surface locally; a stale registered command still receives a deprecation reply until Discord commands propagate. Legacy linked temp text cleanup/sync code stays in place for safety.
- `/interface` has now been retired from the active bot surface: it is removed from slash registration/help, startup no longer restores persistent interface messages, and old interface component clicks receive a deprecation reply that points users back to slash commands. Stored interface metadata remains dormant for now to avoid risky schema cleanup.
- The repository-wide Pemucik rebrand supersedes the earlier temporary public-brand pass. User-facing copy, package metadata, internal reasons, docs, and PM2 scripts now use Pemucik; the donation fallback remains `https://donatty.com/parks33`.
- New installations default to `data/pemucik.sqlite`. When `DATABASE_PATH` is unset, runtime configuration falls back to an existing legacy `data/xenovoice.sqlite` so the cosmetic rebrand does not orphan deployed data.
- Discord component custom-ID prefixes remain `xv:panel` and `xv:interface` as compatibility identifiers for cached messages and interactions; they are not current branding.
- `/help` is temporarily disabled and omitted from slash registration; stale cached `/help` invocations receive an ephemeral fallback reply.
- `/voice lfm` is temporarily hidden from slash registration; only a stale cached invocation can still receive a temporary disabled reply.
- Admin slash commands `/setup`, `/set`, `/reset`, and dormant `/interface` now all require `Administrator` both in slash visibility and in runtime permission checks.
- `package.json` now includes minimal PM2 npm scripts for the `pemucik-bot` process: `pm2:start`, `pm2:stop`, `pm2:restart`, `pm2:delete`, `pm2:logs`, `pm2:save`, `pm2:startup`, and `pm2:status`.
- User-facing embeds now resolve their sidebar color dynamically from the dominant color of the bot's static PNG avatar through `src/utils/embedColor.ts`, with in-memory caching and a safe fallback to `APP_COLOR` if avatar fetch/parsing fails.

## 🧱 Stable Architectural Invariants
- Stack: Node.js LTS, TypeScript, discord.js v14, SQLite with `better-sqlite3`.
- Supported runtime contract: Node 24 only (`>=24 <25`); Node must be installed by the host/operator and must not be shipped as an npm application dependency.
- Structure: thin handlers in `commands/` and `events/`, business logic in `services/`, persistence in `db/repositories/`, shared helpers in `utils/`.
- Safety rule: destructive channel actions must be confirmed against `temp_channels` before execution.
- Permission safety: lock/unlock and similar updates must not wipe unrelated permission overwrites.
- Database/runtime safety: `temp_tts_settings` is keyed to tracked temp rooms and must not outlive them; legacy linked temp text artifacts remain tied to tracked temp rooms only.
- Discord runtime constraint: one bot account can hold only one active voice connection per guild, so `/voice tts` queues are room-scoped but playback is serialized per guild.

## 🔍 Verification Snapshot
- The repository-wide Pemucik rebrand passes `npm run lint`, `npm run build`, all 89 compiled tests, package-lock synchronization, and `git diff --check`. The only remaining former-name text is the documented SQLite filename compatibility fallback.
- TTS recovery gate: `npm test` passes 89 tests, including exact-room intake, permission checks, user throttling, partial TTS update preservation, Piper-compatible fake synthesis, stalled-process timeout, partial-file cleanup, queue selection, connection retry policy, and targeted playback cleanup. `npm run lint` and `npm run build` pass locally.
- Production dependency audit is clean after selecting supported `opusscript@0.0.8`; `@discordjs/opus` was rejected because its native installer chain introduced a critical `tar` advisory. FFmpeg remains an explicit host dependency.
- Autonomous remediation now provides `npm test`, which builds and runs 50 compiled Node tests without the Windows `tsx`/`os.userInfo()` failure. Native SQLite smoke, lint, build, and all 50 tests pass with `better-sqlite3@12.11.1` both locally and in an isolated clean Node 24.18.0 copy.
- Runtime dependencies are now discord.js `14.28.1`, `@discordjs/voice` `0.19.2`, and secure `undici`/`ws` transitives. `npm audit --omit=dev` is clean; nine development-only high findings remain blocked upstream through `typescript-eslint -> tinyglobby -> picomatch@4.0.7`, for which npm has no fixed release.
- TypeScript is now `6.0.3` with paired Node16 module settings. Active long-running interaction paths defer before work, ephemeral responses use `MessageFlags.Ephemeral`, and Join-to-Create work is serialized per guild.
- Local automated coverage exists under `tests/` using Node's built-in test runner and temporary SQLite DBs.
- Runtime-contract remediation passed in an isolated clean copy on official Node 24.18.0: native in-memory `better-sqlite3` smoke test, `npm run lint`, `npm run build`, and all 44 compiled tests.
- Cleanup/recovery regression coverage already confirms startup recovery and `channelDelete` also clear room-level TTS runtime state.
- The earlier temporary-brand + reduced command-surface pass passed locally with `npm run lint`, `npm run build`, and `node --import tsx --test tests/tempChannelRecoveryService.test.ts tests/channelDelete.test.ts tests/voiceControlService.test.ts`.
- `npm run commands:register` succeeded afterward and Discord accepted 5 global commands.
- The PM2-script + dynamic-embed-color pass passed locally with `npm run lint` and `npm run build`.
- `commands:register` should be skipped unless the task explicitly requires mutating Discord state.

## ⏳ Still Deferred / Not Fully Verified
- The developer machine still defaults to Node 26.13.0 and the VPS runtime was not changed; both must use Node 24 before normal install/startup. No production database or Discord instance was used during runtime-contract validation.
- `/voice tts` is locally recovered but not live-verified. The development machine runs unsupported Node 26.13.0 and lacks Piper, model variables, and FFmpeg; runtime preflight correctly prevents enablement there.
- The Discord application still requires the operator to enable the Message Content privileged intent before the recovered intake can function live.
- `/setup` still needs targeted live verification for category/editability flows after the slash-only interface transition.
- `/voice lfm` remains a hidden placeholder, not a finished feature.
- Pemucik branding is active in code, but stale Discord clients may briefly continue to show cached command metadata until commands are registered and propagation completes.

## 📜 Compressed Project Status
- Core Join-to-Create flow, immediate cleanup, owner controls, grouped `/voice` controls, dormant `/voice tts` codepaths, legacy linked-text cleanup support, and automated regression tests are in place.
- Russian-first Discord-facing UX and current operator docs were already aligned in the repo.
- Older release/listing/VPS migration details are intentionally omitted here; treat their docs as historical reference only when needed.
