# Recovered Feature Design: Local Text-to-Speech with Piper

## Status
- Control, intake, playback, throttling, timeout, and cleanup milestones implemented locally
- Live Discord verification still pending
- Intended as a narrow post-MVP slice, not a broad new product surface
- Current investigation and recovery evidence is in `docs/tts-investigation.md`

## Goal
Provide opt-in room-level TTS so native voice-channel chat, with a stored linked text channel as a legacy fallback, can be read aloud inside the same tracked temporary voice room.

This feature must stay:
- Discord-only
- owner/admin controlled
- tied to tracked temp rooms only
- safe around cleanup and recovery
- free-first and local-first through Piper

## Why this shape fits Pemucik
Pemucik already has a safe linked text model:
- tracked temp voice rooms live in `temp_channels`
- linked temp text rooms live in `temp_text_channels`
- cleanup and recovery already protect paired voice/text artifacts

Because of that, the safest TTS scope is not server-wide text reading. The safest scope is:
- one tracked temp voice room
- one linked temp text channel
- one explicit per-room TTS toggle

## Non-Goals for the first slice
Do not implement these in the first version:
- server-wide TTS for arbitrary text channels
- DM reading
- reading messages outside linked temp text channels
- cloud TTS providers or API-key-dependent voice services
- a large open-ended voice marketplace
- premium-only voice options
- automatic TTS in non-tracked voice channels
- attachments, embeds, or image OCR reading
- multilingual auto-detection or translation
- user-level preferences that override room-level settings

## User Experience
### Setup flow
1. Room owner or admin creates a linked text channel with `/voice text` if it does not already exist.
2. Room owner or admin enables TTS for that room with `/voice tts enabled:true`.
3. Room owner or admin optionally chooses a curated Piper voice preset with `/voice tts voice:<preset>`.
4. Members type in the linked text channel.
5. Pemucik reads those messages into the matching temp voice room while the room is active.

### Initial command surface
Recommended first public surface:
- `/voice tts enabled:true|false`
- `/voice tts voice:<preset>`
- optional later: `/voice tts test text:<sample>`

The feature should fail cleanly when:
- the actor is not the room owner or an admin
- no linked temp text channel exists yet
- the target room is not tracked in SQLite
- the temp room no longer exists in Discord

## Safety Rules
TTS must follow the same conservative model as the rest of Pemucik:
- never read from a text channel unless it is confirmed in `temp_text_channels`
- never target a voice channel unless it is confirmed in `temp_channels`
- stop playback and clear room TTS state when the tracked temp room is deleted or becomes stale
- ignore bot messages
- ignore slash command invocations and likely command-like messages if needed
- ignore empty messages and attachment-only posts in the first slice
- cap message length before synthesis
- use one playback queue per tracked temp room
- apply overflow limits so one spammer cannot build an unbounded queue
- do not auto-create linked text channels as a side effect of reading messages

## Proposed Persistence
Use a new additive SQLite table dedicated to room-level TTS settings instead of overloading `guild_settings` or `temp_channels`.

Suggested table:
- `temp_tts_settings`
  - `voice_channel_id` TEXT PRIMARY KEY
  - `guild_id` TEXT NOT NULL
  - `enabled` INTEGER NOT NULL DEFAULT 0
  - `voice_key` TEXT NOT NULL
  - `created_at`
  - `updated_at`

Why this is the safest first model:
- settings belong to one tracked temp room, not the whole guild
- cleanup can remove TTS state when the temp room is deleted
- the current `temp_channels` safety model stays simple
- future changes like speech rate can be added without disturbing core room ownership data

## Suggested Voice Presets
Start with a small curated preset list stored in code, for example:
- one default Russian voice
- one alternate Russian voice
- one English voice

Do not start with arbitrary model uploads or a huge preset catalog.

The first implementation should treat `voice_key` as an internal preset identifier that maps to a known Piper model path plus optional synthesis flags.

## Runtime Architecture
### New pieces
Recommended additions:
- `src/events/messageCreate.ts`
- `src/services/ttsPlaybackService.ts`
- `src/db/repositories/tempTtsSettingsRepo.ts`
- one additive migration for `temp_tts_settings`

### Required Discord runtime additions
The bot will likely need these gateway capabilities once TTS is implemented:
- `GuildMessages`
- `MessageContent`

### Required audio/runtime dependencies
Implementation now requires:
- `@discordjs/voice`
- a reproducible audio pipeline from Piper WAV output into Discord voice playback
- a stable way to access Piper binaries/models on the host

The current runtime expects:
- `PIPER_COMMAND` optionally pointing at the Piper binary; default fallback is `piper`
- `PIPER_MODEL_DEFAULT`
- `PIPER_MODEL_RU_ALT`
- `PIPER_MODEL_EN_DEFAULT`
- a local FFmpeg binary available on the host `PATH` so Discord voice playback can consume synthesized WAV output

## Message Handling Rules
When `messageCreate` fires, the first slice should only continue if all of these are true:
- the message is in a guild
- the author is not a bot
- the message channel is a tracked linked temp text channel
- the linked voice room is still tracked
- room-level TTS is enabled for that voice room
- the linked voice room still exists and has members
- the text body is non-empty after trimming
- the message length is below the configured cap

Suggested first-slice text filtering:
- trim whitespace
- collapse repeated whitespace
- optionally drop raw URLs or replace them with a short placeholder
- ignore very long messages instead of chunking them in V1

## Playback Model
Use one in-memory queue per tracked temp voice room.

Recommended behavior:
- enqueue one synthesized audio job per accepted message
- if playback is idle, start immediately
- if the queue is already too long, drop new jobs and log the overflow
- when the queue drains and the room becomes idle, disconnect after a short grace period

This keeps resource usage predictable on a small VPS.

Important runtime constraint:
- a single bot account can keep only one active Discord voice connection per guild
- because of that, room queues remain room-scoped, but actual playback is serialized at the guild level
- if several temp rooms in one guild enqueue TTS simultaneously, the bot will process queued room jobs in oldest-first order and hop the voice connection between rooms as needed

## Cleanup and Recovery Integration
TTS state must integrate with existing cleanup/recovery paths:
- when a tracked temp room is deleted manually, remove its persisted TTS settings and stop playback
- when startup recovery removes stale or empty tracked rooms, remove matching TTS state as well
- when external channel deletion is recovered through `channelDelete`, clear matching TTS state
- if the linked text channel disappears, do not read anything until the linked text mapping is restored

## Logging
Add explicit structured logs for:
- `voice_tts_enabled`
- `voice_tts_disabled`
- `voice_tts_voice_changed`
- `voice_tts_message_ready`
- `voice_tts_message_queued`
- `voice_tts_message_skipped`
- `voice_tts_queue_overflow`
- `voice_tts_playback_failed`
- `voice_tts_runtime_unavailable`
- `voice_tts_cleanup`

## Recommended Implementation Order
1. Add docs and finalize the planned scope.
2. Add the additive DB table/repository for room-level TTS settings.
3. Add `/voice tts enabled` and `/voice tts voice` without playback first.
4. Add `messageCreate` intake with strict room/channel validation.
5. Add Piper synthesis plus a minimal room queue and Discord voice playback.
6. Integrate cleanup and recovery hooks.
7. Add focused local tests for repository, filtering, and queue/runtime selection logic.
8. Run a dedicated live Discord pass only after the local path is stable.

Current checkpoint:
- Steps 1 through 7 are implemented locally
- Step 8 is now the next milestone
- The remaining work is focused live Discord validation with Piper and FFmpeg available on the host

## Verification Checklist for the Live Pass
The first live pass should confirm:
- `/voice tts enabled:true` only works for owner/admin on a tracked temp room
- native voice-channel chat is read into the matching temp voice room
- a stored linked temp text channel remains a working fallback
- authors outside the exact voice room are ignored
- messages in unrelated text channels are ignored
- disabling TTS stops future playback
- changing the voice preset affects later messages
- queue overflow does not crash the bot or leak memory
- deleting the tracked temp room clears TTS settings and stops playback
- startup recovery does not leave orphaned TTS rows for stale/empty tracked rooms

## Decision Summary
The recommended first implementation is:
- a narrow `/voice tts` room-level control
- primarily for native voice-channel chat, with linked temp text as a legacy fallback
- only for tracked temp voice rooms
- local Piper-based voices
- small curated preset list
- strict safety checks and bounded queues

That shape keeps the feature aligned with Pemucik's existing SQLite-confirmed temp-room model instead of turning the bot into a general-purpose server TTS reader.
