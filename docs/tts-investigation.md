# Discord TTS investigation and recovery

Date: 2026-11-18

## Outcome

The existing Piper-based TTS feature was structurally complete but unreachable. The Discord client did not request message intents, startup did not register the `messageCreate` handler, and `/voice tts` was absent from the slash-command definition while a stale execution branch returned a disabled message.

This recovery reconnects those paths and adds the safeguards that were missing before the feature was disabled. The implementation is locally verified but still requires a disposable-guild pass with a real Piper model, FFmpeg, Discord voice networking, and the Message Content privileged intent enabled in the Developer Portal.

**In simple terms:** The feature was mostly built but disconnected. It now works in code, while real Discord audio remains an explicit final verification step.

## Recovered flow

The active path is now:

1. An owner or administrator configures a tracked temporary room with `/voice tts`.
2. Enabling performs a local runtime preflight for the selected model, Piper executable, FFmpeg, and an Opus encoder.
3. `messageCreate` accepts native voice-channel chat as the primary source. A stored linked temporary text channel remains a compatibility fallback.
4. Intake confirms the room exists in `temp_channels`, TTS is enabled, the message is valid, and its author is connected to that exact voice room.
5. Accepted messages pass a per-user cooldown and bounded room/guild queues.
6. Piper receives text through stdin and writes a temporary WAV.
7. `@discordjs/voice` joins the tracked room, FFmpeg prepares the audio stream, and the guild-scoped player plays it.
8. Temporary audio is removed after success, failure, timeout, or cancellation. Disabling TTS or deleting the room cancels active work and clears queued work for that room.

Playback remains serialized per guild because one bot account can maintain one active voice connection per guild. Separate room queues preserve ordering without attempting concurrent guild voice connections.

**In simple terms:** Only people currently inside a tracked room can make it speak, and each guild processes speech in a controlled, cleanup-safe order.

## Why the previous live attempt failed

`MEMORY.md` recorded the old connection sequence as `signalling -> connecting(code 0/1, endpoint assigned) -> signalling(code 6)`. The failure happened before the voice connection reached UDP-ready and before audio conversion or playback began. Missing FFmpeg or Opus therefore did not cause that specific handshake failure.

The exact historical cause cannot be proven from the retained log because it lacks the Discord close code and complete networking error. The previous implementation used an older `@discordjs/voice` generation and predated Discord's current DAVE requirements. The repository now uses `@discordjs/voice` 0.19.2, Voice Gateway v8/DAVE support through `@snazzah/davey`, and more detailed connection-state logging. A live pass is still required to determine whether the old failure is resolved on the actual host and network.

Discord voice also requires outbound and inbound UDP. A VPS firewall or provider network that blocks UDP can still prevent the connection from reaching Ready even when the WebSocket endpoint is assigned.

**In simple terms:** The old failure occurred while joining Discord voice, not while creating audio. Updated voice support helps, but only a real server test can prove the network path.

## Problems found and fixed

- Added `GuildMessages` and `MessageContent` intents and registered `messageCreate` during startup.
- Restored `/voice tts enabled:<boolean>` and `/voice tts voice:<preset>` to the command builder and execution path.
- Added runtime preflight before enabling, with actionable failures for missing model configuration, unreadable model files, unavailable Piper, missing FFmpeg, or missing Opus support.
- Required the message author to be connected to the exact tracked temporary voice room.
- Added a three-second per-user cooldown, a five-message room queue, and a twenty-message guild queue.
- Added a thirty-second synthesis timeout and cancellation for disabled, deleted, or shutting-down rooms.
- Removed partial temporary WAV files when Piper fails or times out.
- Added an audio-player error listener so media errors cannot become unhandled EventEmitter errors.
- Preserved omitted fields during `temp_tts_settings` upserts; changing one setting no longer resets the other.
- Added the supported `opusscript` encoder fallback. The preferred native `@discordjs/opus` package was rejected because its installer dependency introduced a critical production audit finding.

No schema, migration, permission-overwrite, deployment, bot identity, or destructive channel-deletion behavior was changed.

**In simple terms:** The recovery closes the routes that could let outsiders spam speech, queues grow indefinitely, or failed synthesis leave files and stale playback behind.

## Runtime requirements

The bot host must provide:

- Node.js 24, matching the repository engine contract.
- Piper CLI. `PIPER_COMMAND` may point to the executable; otherwise `piper` must resolve on `PATH`.
- At least the selected model variable: `PIPER_MODEL_DEFAULT`, `PIPER_MODEL_RU_ALT`, or `PIPER_MODEL_EN_DEFAULT`.
- FFmpeg available on `PATH`.
- `opusscript`, installed as an application dependency.
- Discord permissions `View Channel`, `Connect`, and `Speak` in the target voice room.
- The Message Content privileged intent enabled for the application in the Discord Developer Portal.
- Working outbound and inbound UDP from the host for Discord voice.

The current development machine is not a valid live-audio host: it runs Node 26.13.0, and neither FFmpeg nor Piper/model variables are installed. Runtime preflight correctly refuses to enable TTS in that state.

Piper's original `rhasspy/piper` repository was archived and development moved to `OHF-Voice/piper1-gpl`. The CLI contract used here remains stdin text plus `--model` and `--output_file`.

**In simple terms:** Code readiness is separate from host readiness. Piper, a model, FFmpeg, Discord intent configuration, and UDP access must all exist before enabling TTS.

## Windows setup

1. Install Python 3.9 or newer and create a dedicated virtual environment: `py -m venv .venv-piper`.
2. Activate it and install the current upstream package: `.\.venv-piper\Scripts\Activate.ps1`, then `python -m pip install piper-tts`.
3. Download the required voices with `python -m piper.download_voices <voice-name>`. Keep each `.onnx.json` file beside its matching `.onnx` model.
4. Set `PIPER_COMMAND` to the resulting `piper.exe` path and set each enabled preset variable to its `.onnx` path. Use operator-specific environment configuration rather than committing absolute paths.
5. Download a Windows FFmpeg build through the links on the official FFmpeg download page, add its `bin` directory to the service account's `PATH`, and restart the terminal or service.
6. Verify `& $env:PIPER_COMMAND --help`, `ffmpeg -version`, and a local synthesis such as `'test' | & $env:PIPER_COMMAND --model $env:PIPER_MODEL_DEFAULT --output_file tts-smoke.wav`.

The upstream project documents `pip install piper-tts` and its voice downloader in the [Piper CLI guide](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md). FFmpeg itself publishes source and links to maintained Windows builds from its [official download page](https://ffmpeg.org/download.html).

## Linux/VPS setup

1. On Debian or Ubuntu, install the host tools with `sudo apt update` and `sudo apt install ffmpeg python3-venv python3-pip`.
2. Create and activate a dedicated Piper environment: `python3 -m venv .venv-piper` and `source .venv-piper/bin/activate`.
3. Install Piper with `python -m pip install piper-tts`, then download the chosen voice with `python -m piper.download_voices <voice-name>`.
4. Set `PIPER_COMMAND` to the virtual environment's `piper` executable and the preset environment variables to the matching `.onnx` files. Keep the model JSON files beside them.
5. Verify `"$PIPER_COMMAND" --help`, `ffmpeg -version`, and `printf '%s\n' test | "$PIPER_COMMAND" --model "$PIPER_MODEL_DEFAULT" --output_file tts-smoke.wav` as the same account that runs the bot.
6. Confirm the VPS and provider allow Discord voice UDP in both directions. A successful HTTPS/WebSocket connection does not prove UDP is available.

Other Linux distributions should use their maintained FFmpeg package. The bot does not rely on a bundled FFmpeg binary, and it should not use a path copied from another machine.

**In simple terms:** Install Piper in its own Python environment, expose its executable and models through environment variables, and make FFmpeg visible to the bot's service account.

## Verification completed

- `npm test`: 89 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed as part of the test run and again during implementation.
- `npm audit --omit=dev`: zero vulnerabilities.
- Dependency report: `@discordjs/voice` 0.19.2, `prism-media` 1.3.5, `opusscript` 0.0.8, DAVE library 0.1.12, native AES-GCM available, FFmpeg not found on this machine.
- Fake Piper process test: text reaches a Piper-compatible stdin contract and a WAV path is returned.
- Timeout test: a stalled fake Piper process is killed and its partial WAV is deleted.

Automated coverage also verifies exact-room membership, user throttling, partial settings updates, queue selection, connection retry policy, and targeted cleanup. It does not emulate Discord's real voice gateway, UDP discovery, encryption negotiation, FFmpeg decoding, or audible playback.

**In simple terms:** Local logic and failure cleanup are tested. The remaining uncertainty is the real Discord connection and audible output on a correctly prepared host.

## Required live pass

Do not treat TTS as production-verified until the checklist in `agent_docs/testing.md` passes in a disposable guild. Do not run command registration or alter the Developer Portal as part of ordinary local verification; those are explicit operator actions.

During the pass, retain logs from `voice_tts_connection_state_change`, `voice_tts_connection_disconnected`, and `voice_tts_connection_error`. If the connection still fails before Ready, capture the Discord close code, final connection status, endpoint presence, UDP state, host firewall rules, and provider UDP policy before changing playback code.

**In simple terms:** If live joining still fails, collect the complete voice error first. That evidence distinguishes Discord compatibility problems from firewall or provider UDP blocks.
