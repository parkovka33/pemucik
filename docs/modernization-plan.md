# Pemucik Modernization Plan

## Implementation outcome — 2026-11-18

The required modernization batches are complete locally. The repository now uses discord.js `14.28.1`, `@discordjs/voice` `0.19.2`, `better-sqlite3` `12.11.1`, TypeScript `6.0.3`, Node16 module resolution, current supported-major lint/test tooling, and a compiled `npm test` command. The latest local protected-remediation gate passes lint, build, and all 82 tests on the audited Windows host. The earlier clean Node 24.18.0 run covered the 50-test pre-protected baseline; the new protected changes still require a clean Node 24 rerun before release.

The runtime security chains were corrected: `undici@6.29.1`, `ws@8.23.0`, and `brace-expansion@1.1.22` are resolved, and `npm audit --omit=dev` reports zero vulnerabilities. The full audit still reports nine development-only high findings through the latest TypeScript-eslint glob chain. npm has not published a non-vulnerable `picomatch` release, while its suggested TypeScript-eslint downgrade has a TypeScript `<6.0.0` peer range. That batch is therefore blocked upstream.

The installed `better-sqlite3` 12.x line now supports Node 26 as well as Node 24, correcting the earlier assumption that a v13 major was necessary for local Node 26 compatibility. The application contract remains Node 24 because that is the approved production baseline. Registry metadata for `@discordjs/voice@0.19.2` declares Node `>=22.12.0`; rendered 0.19.0 documentation states Node 24.17+, so the project keeps the stricter Node 24.18+ validation baseline.

TTS intake was not restored. Its absence is deliberate active-product behavior, not a compatibility defect. The local voice dependency report confirms DAVE and native AES-GCM support but no FFmpeg or Opus implementation, so real playback remains unverified and TTS must stay disabled.

The four approved protected findings are implemented locally: versioned atomic migrations, retryable child cleanup, persist-before-move Join-to-Create with unique ownership, and recoverable lock/ghost permission mutation. They are not production-ready yet. Database changes require a restored production-shaped rehearsal, and permission/lifecycle changes require a disposable Discord guild pass.

See `remediation-tracker.md` for implementation and release-readiness status.

**In simple terms:** Modernization and protected fixes pass locally, but a copied real-world database and disposable Discord server must validate them before production release.

**Audit date:** 2026-11-18
**Scope:** dependency, Discord API, Node.js runtime, TypeScript, native-addon, and security compatibility
**Change policy for this audit:** documentation only; no dependency, lockfile, source, compiler, database, or deployment changes were made

## Executive verdict

Pemucik is not currently runnable in the audited local environment even though its TypeScript and ESLint checks pass. The active runtime is Node.js `v26.13.0`, while the installed `better-sqlite3@12.9.0` explicitly supports Node 20, 22, 23, 24, and 25—not Node 26—and its native binding fails to load for ABI `node-v147`.

There are four immediate priorities:

1. Remove the direct npm dependency on the experimental `node@27.0.0-alpha.0.1.1` package and pin a real, supported production runtime. Node 24 LTS is the lowest-risk immediate target for this repository.
2. Restore a working SQLite native binding under that pinned runtime before attempting any bot or database validation.
3. Update the Discord HTTP/WebSocket dependency chain to eliminate the confirmed `undici` and `ws` advisories.
4. Repair the TTS message path: its handler is never registered, and the client does not request either gateway intent required to receive guild message content.

The installed `discord.js` major remains appropriate. There is no evidence supporting a discord.js major migration, an ESM conversion, Components V2 adoption, or a database replacement at this time.

## Audit method and evidence

The following read-only checks were performed on 2026-11-18:

- Inspected `package.json`, `package-lock.json`, installed package metadata, `tsconfig.json`, ESLint configuration, command registration, event registration, interaction handlers, permission operations, and voice/TTS code.
- Ran `node --version`, `npm --version`, `npm ls`, `npm outdated --json`, and `npm audit --json` without applying fixes.
- Ran `tsc -p tsconfig.json --noEmit`: passed with TypeScript `5.9.3`.
- Ran `npm run lint`: passed with ESLint `9.39.4`.
- Loaded and instantiated `better-sqlite3` with an in-memory database: failed before database creation because no Node 26 native binding was available.
- Ran `@discordjs/voice.generateDependencyReport()`: FFmpeg and Opus libraries were not found locally; Node's built-in `aes-256-gcm` support was available.
- Queried current documentation through Context7 for discord.js, better-sqlite3, and TypeScript, then cross-checked important claims against package metadata and official primary sources.

One Context7 discord.js page labelled `14.26.2` reported a newer Node requirement than the published `14.26.x` package metadata. For version-specific engine decisions, this plan therefore uses the immutable installed/registry package metadata and the official release changelog rather than that inconsistent rendered page.

## 1. Dependency inventory

Versions marked “latest” below are stable npm registry results verified on 2026-11-18. A newer version is not automatically recommended.

| Package | Declared range | Installed/locked | Latest stable | Runtime/compatibility notes | Recommendation |
|---|---:|---:|---:|---|---|
| `discord.js` | `^14.17.3` | `14.26.4` | `14.28.1` | Installed and latest metadata allow Node `>=18`; current lock contains vulnerable `undici@6.24.1` | Update within v14 promptly; do not change major |
| `@discordjs/voice` | `^0.18.0` | `0.18.0` | `0.19.2` | `0.19.x` requires Node `>=22.12.0`, adds Voice Gateway v8 and DAVE E2EE; pre-1.0 minor can be breaking | Compatibility-critical staged update after pinning Node 24 |
| `better-sqlite3` | `^12.9.0` | `12.9.0` | `13.2.0` | Installed version excludes Node 26 and fails locally; latest requires Node `>=22`; native install script/prebuild involved | Restore on Node 24, update to latest 12.x first, then evaluate v13 separately |
| `dotenv` | `^16.4.7` | `16.6.1` | `18.0.10` | Current version supports Node `>=12`; no audit advisory found | Keep for now; v18 is optional major work |
| `node` (npm package) | `^27.0.0-alpha.0.1.1` | `27.0.0-alpha.0.1.1` | No applicable stable recommendation | Direct dependency with install script; it is an alpha binary package, not the host runtime | Remove immediately during implementation |
| `typescript` | `^5.7.2` | `5.9.3` | `7.0.2` | Current compiler passes; TS 7 rejects legacy `moduleResolution: node` and is outside the current linter peer range | Keep 5.9 initially; stage TS 6; postpone TS 7 |
| `typescript-eslint` | `^8.18.2` | `8.59.1` | `8.73.0` | Latest supports TypeScript `>=4.8.4 <6.1.0` and ESLint 8/9/10; audit range is fixed after `8.72.2` | Security update to `8.73.0` |
| `eslint` | `^9.17.0` | `9.39.4` | `10.15.0` | Latest requires Node `^20.19 || ^22.13 || >=24`; v10 is a breaking major | Take `9.39.5` first; evaluate v10 later |
| `@eslint/js` | `^9.17.0` | `9.39.4` | `10.0.1` | Must remain aligned with ESLint major | Take `9.39.5` first; pair any v10 migration |
| `tsx` | `^4.19.2` | `4.21.0` | `4.23.15` | Installed chain contains vulnerable `esbuild@0.27.7`; latest tsx uses `esbuild ~0.28.0` | Update and verify resolved esbuild is `>=0.28.1` |
| `prettier` | `^3.4.2` | `3.8.3` | `3.10.1` | Same major, Node `>=14` | Safe patch/minor update |
| `globals` | `^15.14.0` | `15.15.0` | `17.14.0` | Two-major jump; current config works | Optional; postpone until ESLint migration |
| `@types/node` | `^22.10.2` | `22.19.17` | `26.6.6` | Types currently do not match active Node 26; they should match the chosen production major, not npm `latest` blindly | Use current 24.x types when Node 24 is pinned |
| `@types/better-sqlite3` | `^7.6.12` | `7.6.13` | `9.6.0` | Type-major upgrade should be validated with the runtime-package upgrade | Defer and compile-test with better-sqlite3 migration |

### Important transitive dependencies

| Dependency | Installed | Origin | Finding |
|---|---:|---|---|
| `undici` | `6.24.1` | `discord.js` / `@discordjs/rest` | Multiple advisories affect versions through `6.29.0`; runtime security update required |
| `ws` | `8.20.0` | `@discordjs/voice` and Discord gateway stack | Advisories affect versions below `8.21.0`; runtime security update required |
| `esbuild` | `0.27.7` | `tsx` | Low-severity Windows development-server file-read advisory; development-only in this project |
| `js-yaml` | `4.1.1` | ESLint | High-severity CPU denial-of-service advisories; development-only exposure |
| `brace-expansion` | `1.1.14`, `5.0.5` | ESLint/typescript-eslint globbing | Multiple denial-of-service advisories; development-only exposure |
| `picomatch` | `4.0.4` | typescript-eslint via tinyglobby/fdir | ReDoS advisory; development-only exposure |

### Update classification

- **Security-critical:** discord.js v14 lock refresh/update, the `undici` and `ws` chains, `typescript-eslint@8.73.0`, and affected lint/tsx transitives.
- **Compatibility-critical:** remove npm `node`; pin Node 24; restore better-sqlite3; update `@discordjs/voice` for Voice Gateway v8 and DAVE.
- **Safe patch/minor:** `discord.js@14.28.1`, `prettier@3.10.1`, `tsx@4.23.15`, ESLint/`@eslint/js` `9.39.5`, and `typescript-eslint@8.73.0`, subject to normal validation.
- **Potentially breaking:** `@discordjs/voice` 0.18 to 0.19, better-sqlite3 12 to 13, ESLint 9 to 10, dotenv 16 to 18, TypeScript 5 to 6/7, globals 15 to 17, and `@types/better-sqlite3` 7 to 9.
- **Remain unchanged initially:** discord.js major 14, CommonJS module format, TypeScript 5.9, and dotenv 16.

## 2. Confirmed Discord API compatibility findings

### D-1 — TTS messages cannot reach the application

**Severity:** critical functional compatibility
**Affected files:** `src/index.ts:18-21`, `src/events/messageCreate.ts:13-60`, `src/client/discordClient.ts:5-9`, `src/services/ttsIntakeService.ts:107-258`

The TTS listener exists but `src/index.ts` never imports or calls `registerMessageCreateHandler`. Even if it were registered, the client requests neither `GatewayIntentBits.GuildMessages` nor `GatewayIntentBits.MessageContent`.

Discord currently maps guild `MESSAGE_CREATE` to `GUILD_MESSAGES`, while the `content` field used by `ttsIntakeService` requires the privileged `MESSAGE_CONTENT` intent. `MESSAGE_CONTENT` must also be enabled in the Developer Portal; otherwise privileged-intent configuration can close the gateway connection with code `4014`.

**Supported behavior:** register the handler, request `GuildMessages` and `MessageContent`, enable Message Content in the portal, and validate the linked-text TTS path in a real guild.
**Migration difficulty:** low code effort, medium operational effort because the privileged intent must be configured and later reviewed if the app crosses Discord's user threshold.
**Regression risk:** medium; message events increase inbound traffic, so the existing early channel/author filters must remain.

### D-2 — `GuildMembers` is privileged and appears broader than current usage needs

**Severity:** compatibility/configuration risk
**Affected file:** `src/client/discordClient.ts:8`

`GuildMembers` is privileged and must be enabled in the portal when requested. The repository has no member add/update/remove event handlers and fetches individual members or the bot member through REST. Voice-channel membership is driven by `GuildVoiceStates`. This makes the privileged member intent likely unnecessary, though removal must be confirmed in the live Discord checklist.

**Supported behavior:** use the minimum required intents. Either remove `GuildMembers` after focused testing or explicitly document and enable it in the Developer Portal.
**Migration difficulty:** low.
**Regression risk:** medium until claim/transfer/invite/admin-role flows are live-tested.

### D-3 — Ephemeral boolean options are deprecated in discord.js v14

**Severity:** non-breaking deprecation
**Affected files:** `src/utils/safeReply.ts:14-37` and approximately 70 call sites under `src/commands`, `src/interactions`, and `src/events`

discord.js `14.26.x` marks `InteractionReplyOptions.ephemeral` and `InteractionDeferReplyOptions.ephemeral` as deprecated. The supported form is `flags: MessageFlags.Ephemeral`. `fetchReply` is also deprecated in favor of `withResponse`, although this repository does not currently use `fetchReply`.

**Supported behavior:** centralize ephemeral reply creation around `MessageFlags.Ephemeral`, preserve `safeReply`'s distinction between reply, edit, and follow-up, and do not try to change flags when editing an already deferred response.
**Migration difficulty:** low but broad/mechanical.
**Regression risk:** low with the existing `safeReply` unit coverage expanded.

### D-4 — `/setup` can miss Discord's initial interaction deadline

**Severity:** confirmed design risk against the current API deadline
**Affected files:** `src/commands/setup.ts:65-123`, `src/services/setupService.ts:261-289`

Discord invalidates an interaction token if the initial response is not sent within three seconds. `/setup` performs member lookup, channel fetch/create operations, persistence, and embed-color fetching before its first reply. On a slow REST request it can complete the mutation but fail to acknowledge the interaction.

The grouped `/voice` command already defers before its network work. The older standalone claim/lock/unlock/rename/limit/panel commands also perform REST work before replying and should be normalized, though `/setup` is the highest-risk case.

**Supported behavior:** after cheap guild/permission validation, defer ephemerally before Discord/database work, then edit the deferred reply. Modal-opening paths must continue to use `showModal` as the initial response instead of deferring first.
**Migration difficulty:** low to medium.
**Regression risk:** low with response-state tests and live slow-network checks.

### D-5 — Guild-only commands are globally registerable in DM contexts

**Severity:** optional UX/API modernization
**Affected files:** command builders under `src/commands`, `scripts/registerCommands.ts`

The handlers reject non-guild use, but global command definitions do not explicitly restrict current interaction contexts. Discord's current command model uses `contexts`; the older `dm_permission` field is deprecated.

**Supported behavior:** after confirming installed discord.js builder support, set guild-only contexts in the command definitions and re-register commands.
**Migration difficulty:** low.
**Regression risk:** low; validate both guild-scoped development commands and global registration.

### Discord behavior confirmed suitable

- `REST({ version: '10' })` and `Routes.applicationCommands` / `applicationGuildCommands` are current.
- Bulk `PUT` registration is supported. The opt-in opposite-scope clearing behavior is safer than unconditional deletion.
- Guild commands remain appropriate for immediate development; global commands remain appropriate for release.
- Button action rows, string selects, and modals used by the project remain supported. Components V2 is not required for this bot.
- `client.rest.put('/channels/{id}/voice-status', { body: { status } })` matches Discord's current Set Voice Channel Status endpoint.
- The hand-coded `1n << 48n` permission matches current `SET_VOICE_CHANNEL_STATUS`. It is necessary with installed discord.js because that named flag and route helper are not exposed there.
- The voice-status length limit of 500 characters matches current Discord documentation.
- Permission overwrites use discord.js edit methods and the reviewed lock/unlock logic clears individual managed permission bits rather than replacing entire overwrite sets.
- discord.js REST and gateway clients provide route-aware rate-limit handling. No custom bypass was found.

## 3. Node.js runtime compatibility

### Current state

- Project declaration: `node >=20`.
- Active local runtime: Node `26.13.0` LTS.
- Latest Node 26 patch verified: `26.13.1` LTS.
- Official supported LTS lines on the audit date: 22, 24, and 26.
- Node 20 reached end of life on 2026-03-24, so the current engine range still admits an unsupported runtime.
- Node 27 is in Alpha status. It is not suitable for production and must not be treated as a stable release.

### Recommended runtime policy

Use Node 24 LTS as the immediate production and development baseline, ideally pinned to the current 24.x patch by the deployment/version manager. During implementation, make `engines.node` exclude Node 20 and reflect the tested production band rather than the unbounded `>=20` range.

Node 24 is the safest bridge because:

- installed better-sqlite3 12.9 explicitly supports it;
- `@discordjs/voice@0.19.2` requires only Node `>=22.12`;
- it remains an officially supported LTS line;
- it avoids making the native-addon recovery and the Node 26 transition one combined change.

Node 26 can be adopted later after better-sqlite3 13.x is proven on the actual VPS. Official Node 26 Linux binaries also link against `libatomic`, which may require an additional host package depending on the distribution. Infrastructure changes require separate human approval under project policy.

### Experimental npm `node` package origin

The unexpected `node@27.0.0-alpha.0.1.1` is a direct dependency in the current uncommitted `package.json` and lockfile changes. `npm ls node --all` confirms no parent dependency introduced it. It has an install script and pulls `node-bin-setup`; it does not change the already-running shell's host Node version. Keeping it creates duplicate runtimes, supply-chain/install-script exposure, platform variance, and confusion about which binary PM2 or scripts execute.

## 4. TypeScript compatibility

### Current state

- Installed compiler: TypeScript `5.9.3`.
- `target`: `ES2022`.
- `module`: `CommonJS`.
- `moduleResolution`: `node` (legacy `node10` algorithm).
- Strictness is strong: `strict`, `noImplicitOverride`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are enabled.
- `esModuleInterop` and `resolveJsonModule` are enabled.
- `skipLibCheck` is enabled.
- Type checking currently passes without emission.
- The emitted entry path `dist/src/index.js` is consistent with `rootDir: "."` and the current `start` script.

### Compatibility assessment

There is no demonstrated runtime need to migrate from CommonJS to ESM. CommonJS should remain in place.

The legacy `moduleResolution: node` setting is the blocker for future compilers. TypeScript 6 reports the `node10` resolver as deprecated; TypeScript 7 stops supporting it. A future migration should pair `module: Node16` with `moduleResolution: Node16` (or use NodeNext only if the project deliberately adopts Node's newest module semantics). That change is about accurate Node package resolution, not an ESM migration by itself.

Do not jump directly to TypeScript 7. The latest `typescript-eslint@8.73.0` peer range ends below TypeScript 6.1, so TypeScript 7 would create an unsupported toolchain even after fixing module resolution.

### Staged compiler path

1. Keep TypeScript 5.9 while security and runtime fixes land.
2. Change the resolver/module pair in a dedicated change and compile/test under 5.9.
3. Upgrade to TypeScript 6.0.x with `typescript-eslint@8.73.0` and address diagnostics.
4. Postpone TypeScript 7 until typescript-eslint officially supports it and all diagnostics are understood.

## 5. Native and external runtime dependencies

### better-sqlite3

`better-sqlite3` is a C++ addon installed through an install script. Prebuilt binaries are provided for common platforms, but unsupported runtime/ABI combinations fall back to a local node-gyp build or fail. A source build requires Python and a C++ compiler; on a small Linux VPS this also means build tools and compatible libc headers.

The current Node 26 failure tried all standard binding locations and ended at:

`node_modules/better-sqlite3/lib/binding/node-v147-win32-x64/better_sqlite3.node`

No matching binary existed. Do not approve or bypass install scripts blindly. Reinstall only after the runtime is pinned, verify package integrity, and test an in-memory database before touching the real SQLite file. A better-sqlite3 major update must be preceded by the existing SQLite backup procedure and review of both better-sqlite3 and bundled SQLite release notes.

### Discord voice, FFmpeg, Opus, and encryption

- Installed `@discordjs/voice@0.18.0` reports no FFmpeg executable and no Opus implementation in the audited Windows environment.
- The TTS pipeline passes generated WAV files to `createAudioResource`; a usable FFmpeg installation is therefore an operational requirement unless the pipeline is changed to emit a directly supported stream format.
- No Opus library is installed. Voice playback may use FFmpeg's conversion path, but the deployment must be verified with the library's dependency report and an actual playback check.
- Node provides `aes-256-gcm`, so an extra sodium encryption package is not currently required for the installed voice version.
- `@discordjs/voice@0.19.x` adds DAVE E2EE support and installs its supported DAVE implementation. Version `0.19.2` contains packet handling fixes and is the appropriate stable target.
- Piper remains an external host dependency configured through environment variables. It was not found on the audited machine. That is expected only if this machine is not the TTS host; production readiness still requires the documented Piper and FFmpeg preflight.

## 6. Security audit

`npm audit --json` reported **17 affected package nodes: 8 high, 8 moderate, 1 low, and 0 critical**. All reported groups had a fix available at audit time. No automatic fix was run.

### Production-relevant findings

| Chain | Severity reported | Exposure in Pemucik | Action |
|---|---|---|---|
| `discord.js -> undici@6.24.1` | High underlying advisories; discord.js aggregate marked moderate | Bot REST and HTTP client path; includes request desynchronization, WebSocket/EventSource DoS, and TLS-related advisories | Update discord.js within v14 and ensure resolved undici is above all audited vulnerable ranges |
| `@discordjs/voice -> ws@8.20.0` | High | Voice WebSocket path; memory exhaustion and memory disclosure advisories | Update voice stack/lock and ensure `ws >=8.21.0` |

### Development-only findings

The ESLint/typescript-eslint/tsx chains contain high-severity denial-of-service advisories in glob/YAML parsing and a low-severity esbuild development-server issue. Pemucik does not expose these tools as a production service, so practical remote production exposure is lower, but poisoned repository input or CI use can still trigger them. Update them promptly without conflating them with the runtime outage.

Representative official advisories:

- [undici WebSocket denial of service](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5)
- [undici TLS option validation bypass](https://github.com/advisories/GHSA-2m5v-pch6-74hx)
- [ws memory exhaustion denial of service](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)
- [picomatch ReDoS](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- [esbuild Windows development-server file read](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)

## 7. Modernization roadmap

### 7.1 Critical compatibility fixes

#### C1. Remove the experimental npm runtime package and pin Node 24 LTS

**Status (2026-11-18):** Repository portion complete. The engine range is `>=24 <25`, the alpha npm `node` package was removed, and official Node 24.18.0 passed an isolated clean install, native SQLite smoke test, lint, build, and all 44 compiled tests. Host/VPS runtime switching and production-data verification remain separate operator work.

- **Problem:** an alpha Node binary is a direct application dependency while the host runtime is separately installed; `engines` admits EOL Node 20.
- **Evidence:** package diff, lockfile install script, `npm ls node --all`, official Node release status.
- **Affected:** `package.json`, `package-lock.json`, approved runtime/deployment documentation.
- **Solution:** remove npm `node`; pin a current Node 24 patch through the approved host/version-manager workflow; narrow engines to the tested band.
- **Benefits:** deterministic runtime, no alpha/install-script ambiguity, supported security baseline.
- **Compatibility:** Node 24 satisfies discord.js and voice 0.19 requirements and is accepted by better-sqlite3 12.9.
- **Regression risk:** medium because native dependencies must be reinstalled for the selected ABI.
- **Effort:** small code/package change plus deployment coordination.
- **Validation:** clean install, `node -p process.version`, native SQLite smoke test, typecheck, lint, unit tests, bot preflight.
- **Order:** first.

#### C2. Restore and prove better-sqlite3

**Status (2026-11-18):** Complete locally with `better-sqlite3@12.11.1`. Its published engine range includes Node 24 and Node 26; native smoke tests and all temporary-database tests pass on the audited host. A clean Node 24 reinstall remains the release-environment gate.

- **Problem:** the bot cannot open SQLite under the active local Node 26 runtime.
- **Evidence:** reproducible missing `node-v147-win32-x64` binding failure.
- **Affected:** runtime installation, `better-sqlite3`, lockfile; no schema change required.
- **Solution:** reinstall under pinned Node 24; take latest 12.x patch first; evaluate v13 only after a green baseline.
- **Benefits:** restores startup without combining runtime, native major, and schema risk.
- **Compatibility:** install scripts must run from trusted package contents; prebuilt binary availability must be checked on the target VPS architecture/libc.
- **Regression risk:** high because the database is core state.
- **Effort:** medium.
- **Validation:** backup, in-memory smoke test, copy-of-production database open/read test, repository tests, migration dry verification only when separately approved, restart/persistence Discord check.
- **Order:** immediately after C1.

#### C3. Restore the TTS message event path

**Status (2026-11-18):** Not applicable. TTS is intentionally disabled in the active command/event surface. Re-enabling it is a separate product and Developer Portal change, not required remediation.

- **Problem:** handler not registered; required gateway intents absent.
- **Evidence:** source event-registration trace and official Discord intent mapping.
- **Affected:** `src/index.ts`, `src/client/discordClient.ts`, portal privileged-intent configuration, TTS tests/docs.
- **Solution:** register message handler; add Guild Messages and Message Content; enable Message Content in portal; reassess Guild Members.
- **Benefits:** makes the approved `/voice tts` slice operational.
- **Compatibility:** privileged-intent review obligations apply as the app grows.
- **Regression risk:** medium.
- **Effort:** small code change, medium live validation.
- **Validation:** existing TTS unit tests plus linked text and `/voice tts` live passes; ensure unrelated channels are ignored.
- **Order:** after runtime/database baseline, before release claims.

### 7.2 Security improvements

#### S1. Refresh Discord runtime dependencies without changing discord.js major

**Status (2026-11-18):** Verified locally. discord.js `14.28.1`, voice `0.19.2`, `undici@6.29.1`, and `ws@8.23.0` pass build/lint/tests; the production-only audit is clean.

- **Problem:** vulnerable undici and ws versions are locked.
- **Evidence:** npm audit and lockfile dependency tree.
- **Affected:** `discord.js`, `@discordjs/voice`, lockfile, voice runtime.
- **Solution:** update discord.js to `14.28.1`; update voice to `0.19.2`; confirm secure resolved transitive versions.
- **Benefits:** removes known runtime advisories and adds current DAVE support.
- **Compatibility:** voice 0.19 requires Node `>=22.12`; Node 24 baseline satisfies this.
- **Regression risk:** medium to high for voice playback, low to medium for discord.js v14 minor.
- **Effort:** medium.
- **Validation:** audit, typecheck, lint, all unit tests, command registration in test guild, full voice/TTS live pass.
- **Order:** after C1/C2, before C3 live validation.

#### S2. Clear development-tool advisories in supported majors

**Status (2026-11-18):** Partially fixed and blocked upstream. Direct tools are updated, esbuild and YAML/brace chains are fixed, but nine development-only nodes remain through `picomatch@4.0.7`, which has no fixed npm release.

- **Problem:** typescript-eslint, ESLint, tsx, and their transitive parsers/globbers are vulnerable.
- **Evidence:** npm audit report and npm registry fixed versions.
- **Affected:** devDependencies and lockfile.
- **Solution:** first take `typescript-eslint@8.73.0`, ESLint/`@eslint/js` `9.39.5`, and `tsx@4.23.15`; verify resolved transitive fixed versions. Do not use `npm audit fix --force`.
- **Benefits:** safer CI/local tooling with limited change surface.
- **Compatibility:** retain TypeScript 5.9 during this step.
- **Regression risk:** low to medium.
- **Effort:** small.
- **Validation:** clean install, audit, lint, no-emit typecheck, tests.
- **Order:** parallel with safe dependency updates after runtime recovery.

### 7.3 Safe dependency updates

#### U1. Apply same-major patches/minors in small batches

- **Problem:** several declared ranges resolve below their current safe/stable targets.
- **Evidence:** npm outdated results.
- **Affected:** discord.js, Prettier, tsx, ESLint 9, `@eslint/js` 9, typescript-eslint 8.
- **Solution:** update one functional group at a time and regenerate the lockfile only through normal npm installation after approval.
- **Benefits:** security fixes and maintenance improvements without unnecessary majors.
- **Compatibility:** inspect the resulting tree, not only direct versions.
- **Regression risk:** low to medium.
- **Effort:** small.
- **Validation:** audit, `npm ls`, lint, typecheck, tests, targeted manual checks.
- **Order:** Discord runtime group, tooling security group, formatting group.

### 7.4 Breaking dependency migrations

#### B1. Upgrade @discordjs/voice 0.18 to 0.19

- **Problem:** old voice gateway/encryption behavior and vulnerable ws lock.
- **Evidence:** official changelog: Voice Gateway v8, DAVE implementation, Node 22.12 breaking floor.
- **Affected:** `src/services/ttsPlaybackService.ts`, voice tests, runtime dependencies.
- **Solution:** upgrade only on pinned Node 24; keep the current send-only architecture; review dependency report.
- **Benefits:** current Discord voice compatibility and DAVE support.
- **Compatibility:** pre-1.0 minor is treated as breaking; no unsupported audio-receive assumptions should be added.
- **Regression risk:** high for live audio.
- **Effort:** medium.
- **Validation:** dependency report, connect/reconnect, queue, two-room serialization, Piper/FFmpeg playback, cleanup, shutdown.
- **Order:** after C1/C2, before public release.

#### B2. Evaluate better-sqlite3 13

- **Problem:** v12 does not cover Node 26 and lags bundled SQLite/native packaging improvements.
- **Evidence:** package engines and v13 release notes.
- **Affected:** DB package/types, repositories, backups, deployment build prerequisites.
- **Solution:** first stabilize latest v12 on Node 24; then test v13 against a database copy in a dedicated milestone.
- **Benefits:** current supported-Node policy and future Node 26 path.
- **Compatibility:** native binary, SQLite file/behavior, and type changes must all be reviewed.
- **Regression risk:** high.
- **Effort:** medium.
- **Validation:** backup/restore rehearsal, integrity check, repository tests, migration validation, persistence restart.
- **Order:** after security and live Discord stabilization.

#### B3. Postpone low-value majors

- **Problem:** ESLint 10, dotenv 18, globals 17, and type-package majors add churn without fixing the current outage.
- **Evidence:** current versions work and have no direct production compatibility failure.
- **Solution:** evaluate separately after the critical path is green.
- **Benefits:** limits simultaneous variables.
- **Compatibility:** pair ESLint and `@eslint/js`; match Node types to runtime; pair better-sqlite types with runtime package.
- **Regression risk:** medium.
- **Effort:** small to medium each.
- **Validation:** tool-specific checks.
- **Order:** late/optional.

### 7.5 TypeScript modernization

#### T1. Replace legacy Node10 resolution without changing to ESM

**Status (2026-11-18):** Verified. `module` and `moduleResolution` are both `Node16`; emitted CommonJS startup paths and all tests remain valid.

- **Problem:** `moduleResolution: node` blocks TypeScript 7 and is deprecated in TypeScript 6.
- **Evidence:** current tsconfig and TypeScript 7 documentation/baselines.
- **Affected:** `tsconfig.json`, imports/build output, package start path.
- **Solution:** trial `module: Node16` plus `moduleResolution: Node16` in a dedicated change; preserve CommonJS package behavior.
- **Benefits:** accurate Node package resolution and a supported compiler path.
- **Compatibility:** may surface package export/import diagnostics; do not silence them globally.
- **Regression risk:** medium.
- **Effort:** medium.
- **Validation:** no-emit typecheck, emitted build inspection, `node dist/src/index.js` preflight with safe test config, tests.
- **Order:** after dependency/runtime security stabilization.

#### T2. Move to TypeScript 6, postpone TypeScript 7

**Status (2026-11-18):** Verified. TypeScript `6.0.3` passes build, lint, and tests with typescript-eslint `8.73.0`. TypeScript 7 remains excluded.

- **Problem:** latest compiler is two major versions ahead, but ecosystem peers are not ready for TS 7.
- **Evidence:** `typescript-eslint@8.73.0` supports TypeScript below 6.1 only.
- **Affected:** compiler and lint tooling.
- **Solution:** adopt TS 6.0.x after T1; hold TS 7 until official peer support.
- **Benefits:** incremental diagnostics and lower migration risk.
- **Compatibility:** distinguish compiler diagnostics from runtime behavior.
- **Regression risk:** medium for TS 6; high/unsupported for TS 7 today.
- **Effort:** medium.
- **Validation:** typecheck, lint, emitted build, tests, runtime smoke test.
- **Order:** T1, then TS 6; TS 7 postponed.

### 7.6 Discord API modernization

#### A1. Normalize interaction acknowledgements and ephemeral flags

**Status (2026-11-18):** Verified locally for active paths. Long-running commands/components defer first, modal display stays an immediate initial response, and response-state regressions are covered by tests.

- **Problem:** deprecated ephemeral booleans and network work before initial acknowledgement.
- **Evidence:** discord.js 14.26 docs and Discord's three-second rule.
- **Affected:** `safeReply`, `/setup`, standalone room commands, component handlers, tests.
- **Solution:** use `MessageFlags.Ephemeral`; defer long non-modal actions; preserve modal initial-response rules.
- **Benefits:** fewer unknown-interaction failures and removal of deprecations.
- **Compatibility:** deferred replies must be edited; their ephemeral state cannot be changed later.
- **Regression risk:** low to medium.
- **Effort:** medium due to broad call-site coverage.
- **Validation:** unit tests for fresh/deferred/replied/expired paths and live command/component checks.
- **Order:** after the dependency update establishes final v14 types.

#### A2. Adopt explicit command contexts

- **Problem:** guild-only commands can be exposed in unsupported DM contexts when registered globally.
- **Evidence:** current Discord command contexts model.
- **Affected:** command builders and registration snapshot.
- **Solution:** declare guild contexts with the installed builder API; avoid deprecated `dm_permission`.
- **Benefits:** cleaner Discord-native UX and fewer rejected invocations.
- **Compatibility:** guild-scoped development commands do not support DM contexts anyway.
- **Regression risk:** low.
- **Effort:** small.
- **Validation:** inspect registered payloads and test global/guild command visibility.
- **Order:** with command-schema maintenance, followed by `commands:register` in a test guild.

### 7.7 Optional architecture improvements

#### O1. Add an explicit read-only compatibility preflight

- **Problem:** typecheck/lint can pass while native runtime startup is impossible.
- **Evidence:** this audit's better-sqlite3 failure.
- **Affected:** future package scripts/test utilities and operator docs.
- **Solution:** after approval, add a small preflight that reports Node version, native SQLite load, voice dependency report, and required external binaries without touching the production database.
- **Benefits:** catches ABI and host-tool failures before deployment.
- **Compatibility:** must not create or migrate the production database.
- **Regression risk:** low.
- **Effort:** small.
- **Validation:** run on development Windows and target Linux host.
- **Order:** after runtime recovery.

#### O2. Add a real test script for the existing Node test suite

- **Problem:** tests exist but `package.json` has no documented automated test script.
- **Evidence:** `tests/*.test.ts` and project instructions.
- **Affected:** package scripts and contributor docs.
- **Solution:** choose and document one existing-runtime-compatible invocation without adding a framework unless needed.
- **Benefits:** repeatable dependency-migration validation.
- **Compatibility:** tests use temporary databases and must keep production paths isolated.
- **Regression risk:** low.
- **Effort:** small.
- **Validation:** run from a clean checkout on pinned Node.
- **Order:** before breaking migrations if separately approved.

## 8. Safest implementation order and dependencies

1. Approve runtime/deployment scope and back up SQLite.
2. Remove npm `node`; pin Node 24 LTS; cleanly reinstall for that runtime.
3. Prove better-sqlite3 with an in-memory database and a database copy.
4. Update discord.js within v14 and refresh secure HTTP/WebSocket transitives.
5. Upgrade `@discordjs/voice` to 0.19.2 and validate DAVE/FFmpeg/Piper playback.
6. Update supported-major development tooling and re-run the security audit.
7. Register the TTS message handler, add the required message intents, configure the portal, and reassess Guild Members.
8. Modernize interaction acknowledgement/ephemeral handling and explicit command contexts.
9. Complete the full staged Discord live pass from `agent_docs/testing.md`.
10. Migrate TypeScript resolution, then TypeScript 6.
11. Evaluate better-sqlite3 13 on a database copy and only then consider Node 26 production adoption.
12. Postpone TypeScript 7, ESLint 10, dotenv 18, and other low-value majors until their peer/runtime ecosystems and project tests are ready.

## 9. Required validation gates

Every implementation batch should stop if its matching gate fails:

- `npm ls --depth=0` and targeted transitive-tree inspection.
- `npm audit` with findings classified by runtime versus development exposure.
- `npm run lint`.
- `tsc -p tsconfig.json --noEmit`, then the documented build command when source/config changes are approved.
- Native in-memory better-sqlite3 open/query/close smoke test.
- Existing targeted Node tests using only a temporary database.
- `@discordjs/voice.generateDependencyReport()` on the target host.
- Manual Discord checks for setup, generator creation, ownership, controls, cleanup, linked text, and TTS.
- Database confirmation before any temp-channel edit/delete and a non-temp canary channel throughout the live pass.
- Restart/persistence verification before declaring a runtime or native-addon migration complete.

## 10. Sources verified 2026-11-18

- [Discord Gateway and gateway intents](https://docs.discord.com/developers/events/gateway)
- [Discord Gateway Events](https://docs.discord.com/developers/events/gateway-events)
- [Discord interaction response deadlines and follow-ups](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Discord application commands and registration](https://docs.discord.com/developers/interactions/application-commands)
- [Discord channel resource and Set Voice Channel Status](https://docs.discord.com/developers/resources/channel)
- [Discord permission flags](https://docs.discord.com/developers/topics/permissions)
- [discord.js 14.28.1 release](https://github.com/discordjs/discord.js/releases/tag/14.28.1)
- [@discordjs/voice changelog](https://github.com/discordjs/discord.js/blob/main/packages/voice/CHANGELOG.md)
- [Node.js release status and schedule](https://nodejs.org/en/about/previous-releases)
- [Node.js 26.13.0 LTS notes, including Linux `libatomic`](https://nodejs.org/en/blog/release/v26.13.0)
- [better-sqlite3 13.2.0 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.2.0)
- [better-sqlite3 installation and support policy](https://github.com/WiseLibs/better-sqlite3/blob/master/README.md)
- [TypeScript repository and release documentation](https://github.com/microsoft/TypeScript)
- [typescript-eslint dependency compatibility](https://typescript-eslint.io/users/dependency-versions/)

Registry version, engine, peer-dependency, and audit results in this document were retrieved directly with npm on the audit date. Where a current fact could not be verified from official documentation or registry metadata, this plan marks it as a required validation rather than asserting it.
