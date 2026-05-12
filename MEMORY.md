# System Memory & Context 🧠
 <!--
 AGENTS: Update this file after every major milestone, structural change, or resolved bug.
 DO NOT delete historical context if it is still relevant. Compress older completed items.
 -->

## 🏗️ Active Phase & Goal
**Current Task:** Post-MVP stabilization with focus on keeping the live bot stable while the bot runs under the temporary public brand `Noi` and a reduced command surface.
**Next Steps:**
1. Allow for Discord global command propagation so stale cached `/help`, `/voice lfm`, and older slash variants disappear from clients.
2. Do a later focused live Discord pass for `/setup` and the remaining active `/voice` controls under the temporary `Noi` branding.
3. Only revisit `/voice tts` or wider surface restoration in a deliberate follow-up pass.

## 📌 Current Critical Context
- `/voice tts` code, persistence, and playback diagnostics remain in the repo, but the active bot surface now hides TTS from slash registration and returns a temporary deprecation reply for stale cached `/voice tts` invocations.
- Runtime TTS intake is also disabled for now: startup no longer registers the `messageCreate` intake handler, and the client no longer requests `GuildMessages` or `MessageContent` intents.
- The remaining TTS diagnosis is still the same narrowed voice-handshake failure before UDP-ready; source-of-truth implementation notes remain in `docs/TTS-PIPER-PLAN.md` for a later re-enable pass.
- Empty tracked temp rooms now clean up immediately after the last member leaves; the previous grace delay is set to `0ms`.
- `/voice text` has been removed from the active slash/help surface locally; a stale registered command still receives a deprecation reply until Discord commands propagate. Legacy linked temp text cleanup/sync code stays in place for safety.
- `/interface` has now been retired from the active bot surface: it is removed from slash registration/help, startup no longer restores persistent interface messages, and old interface component clicks receive a deprecation reply that points users back to slash commands. Stored interface metadata remains dormant for now to avoid risky schema cleanup.
- Temporary public rebrand is now active in code: user-facing bot naming was changed from `XenoVoice` to `Noi`, the `/support` donation link fallback now points to `https://donatty.com/parks33`, and user-facing emoji were removed from visible command descriptions, embeds, button labels, and similar UI copy.
- `/help` is temporarily disabled and omitted from slash registration; stale cached `/help` invocations receive an ephemeral fallback reply.
- `/voice lfm` is temporarily hidden from slash registration; only a stale cached invocation can still receive a temporary disabled reply.
- Admin slash commands `/setup`, `/set`, `/reset`, and dormant `/interface` now all require `Administrator` both in slash visibility and in runtime permission checks.
- `package.json` now includes minimal PM2 npm scripts for the `noi-bot` process: `pm2:start`, `pm2:stop`, `pm2:restart`, `pm2:delete`, `pm2:logs`, `pm2:save`, `pm2:startup`, and `pm2:status`.
- User-facing embeds now resolve their sidebar color dynamically from the dominant color of the bot's static PNG avatar through `src/utils/embedColor.ts`, with in-memory caching and a safe fallback to `APP_COLOR` if avatar fetch/parsing fails.

## 🧱 Stable Architectural Invariants
- Stack: Node.js LTS, TypeScript, discord.js v14, SQLite with `better-sqlite3`.
- Structure: thin handlers in `commands/` and `events/`, business logic in `services/`, persistence in `db/repositories/`, shared helpers in `utils/`.
- Safety rule: destructive channel actions must be confirmed against `temp_channels` before execution.
- Permission safety: lock/unlock and similar updates must not wipe unrelated permission overwrites.
- Database/runtime safety: `temp_tts_settings` is keyed to tracked temp rooms and must not outlive them; legacy linked temp text artifacts remain tied to tracked temp rooms only.
- Discord runtime constraint: one bot account can hold only one active voice connection per guild, so `/voice tts` queues are room-scoped but playback is serialized per guild.

## 🔍 Verification Snapshot
- Local automated coverage exists under `tests/` using Node's built-in test runner and temporary SQLite DBs.
- Cleanup/recovery regression coverage already confirms startup recovery and `channelDelete` also clear room-level TTS runtime state.
- The temporary Noi rebrand + reduced command-surface pass passed locally with `npm run lint`, `npm run build`, and `node --import tsx --test tests/tempChannelRecoveryService.test.ts tests/channelDelete.test.ts tests/voiceControlService.test.ts`.
- `npm run commands:register` succeeded afterward and Discord accepted 5 global commands.
- The PM2-script + dynamic-embed-color pass passed locally with `npm run lint` and `npm run build`.
- `commands:register` should be skipped unless the task explicitly requires mutating Discord state.

## ⏳ Still Deferred / Not Fully Verified
- `/voice tts` remains intentionally disabled in the active product until a later deliberate recovery pass; the narrowed live failure is still `signalling -> connecting(code 0/1, endpoint assigned) -> signalling(code 6)` before any UDP-ready state.
- `/setup` still needs targeted live verification for category/editability flows after the slash-only interface transition.
- `/voice lfm` remains a hidden placeholder, not a finished feature.
- Temporary `Noi` branding is active in code, but stale Discord clients may briefly continue to show old cached command metadata until propagation completes.

## 📜 Compressed Project Status
- Core Join-to-Create flow, immediate cleanup, owner controls, grouped `/voice` controls, dormant `/voice tts` codepaths, legacy linked-text cleanup support, and automated regression tests are in place.
- Russian-first Discord-facing UX and current operator docs were already aligned in the repo.
- Older release/listing/VPS migration details are intentionally omitted here; treat their docs as historical reference only when needed.
