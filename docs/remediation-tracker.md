# Remediation Tracker

This tracker was created on 2026-11-18 from `code-quality-audit.md`, `technical-debt.md`, and `modernization-plan.md`. Overlapping findings are grouped under one remediation ID. The current source, package metadata, and project constraints take precedence where the audit documents disagree.

Status meanings: `PENDING`, `IN PROGRESS`, `IMPLEMENTED / LOCAL VERIFIED`, `VERIFIED`, `BLOCKED`, `NOT APPLICABLE`. Local verification does not replace required live Discord or production-shaped database checks.

## Required remediation

| ID | Sources | Severity | Subsystem | Description and required action | Dependencies / priority | Verification | Status |
|---|---|---|---|---|---|---|---|
| REM-001 | CQ-001, C1 | High | Runtime | Keep the repository on the supported Node 24 contract and exclude the accidental npm `node` runtime package. | First | Manifest/lock inspection; clean Node 24 native SQLite, lint, build, tests | VERIFIED — repository requires `>=24 <25`; isolated Node 24.18.0 native SQLite, lint, build, and all 50 tests pass. Host/VPS switching remains operator work. |
| REM-002 | C2 | High | SQLite/runtime | Update within `better-sqlite3` 12.x to a build supporting the audited host while preserving the Node 24 production contract; prove native open/query/close and repository tests. | After REM-001 | In-memory smoke test; full temporary-DB suite; Node 24 compatibility | VERIFIED — `better-sqlite3@12.11.1` passes native smoke and all temporary-DB tests on Node 26 and in a clean Node 24.18.0 copy. |
| REM-003 | CQ-002 | High | Permissions | Make multi-step lock/ghost permission changes recoverable and failure-injection tested without stranding owner, bot, or administrators. | Tests first; protected permission-overwrite behavior | Failure at each overwrite step; DB/Discord consistency; live custom-overwrite pass | IMPLEMENTED / LOCAL VERIFIED — safety allows now precede the broad deny, explicit owner/bot denies fail closed, fresh state is verified, and managed bits roll back after before/after-write failures. Rollback failure reconciles `is_locked` to observed `@everyone` state. A disposable-guild custom-overwrite pass is still required. |
| REM-004 | CQ-003, D-3, D-4, A1 | High | Discord interactions | Acknowledge active long-running commands/components promptly, use `MessageFlags.Ephemeral`, prevent avatar fetches from holding the response indefinitely, and cover reply-state behavior. | After secure discord.js v14 update | Unit response-state tests; lint/build; live latency pass | VERIFIED — active slow paths defer first, modal display stays immediate, avatar fetches time out after 1.5 seconds, and response-state tests pass. Live latency remains a release check. |
| REM-005 | CQ-004 | High | Room lifecycle | Serialize Join-to-Create per guild and provide crash/idempotency compensation for create/move/persist failures. | Test gate first; deletion/schema portions are protected | Concurrent event test; injected failures after create/move/insert; live rapid reconnect | IMPLEMENTED / LOCAL VERIFIED — creation is persisted and confirmed before movement or compensation, transient inserts are bounded-retry, untracked failures are logged rather than deleted, and migration 4 enforces unique `(guild_id, owner_user_id)` after a non-destructive duplicate preflight. Live rapid reconnect and production-shaped duplicate checks remain. |
| REM-006 | CQ-005 | Medium, promoted | Cleanup/persistence | Preserve a retryable safety anchor when linked-child cleanup fails instead of unconditionally deleting the tracked parent row. | Protected cleanup and DB semantics | Failure injection; retry/recovery; disposable DB copy | IMPLEMENTED / LOCAL VERIFIED — cleanup returns explicit completion/retry results, retains parent, child mapping, and persisted TTS settings on uncertain deletion, stops runtime playback, and completes idempotently on retry. No new cleanup-status schema was required. |
| REM-007 | CQ-006, O2 | Medium, Must Fix | Tests | Add one supported `npm test` command that avoids the Windows `tsx` startup failure and reliably discovers all existing tests. | After runtime/native baseline | Clean build plus all existing tests; repeat invocation | VERIFIED — `npm test` consistently builds and runs all 50 compiled tests on Node 26 and clean Node 24.18.0. |
| REM-008 | S1, U1, B1 | High | Runtime dependencies | Update discord.js within v14 and `@discordjs/voice` to the current compatible 0.19 patch; remove vulnerable `undici`/`ws` locks without changing discord.js major. | Node 24 contract | `npm ls`; audit; lint/build/tests; voice dependency report; live playback remains required before TTS reactivation | VERIFIED — discord.js `14.28.1`, voice `0.19.2`, `undici@6.29.1`, and `ws@8.23.0`; production audit is clean and the full local gate passes. |
| REM-009 | S2, U1 | High (development exposure) | Tooling dependencies | Update supported-major ESLint/typescript-eslint/tsx packages and transitive glob/YAML/esbuild fixes without force-upgrading majors. | Runtime baseline | `npm ls`; audit; lint/build/tests | BLOCKED — direct tools and fixable transitives are updated, but nine development-only high nodes remain through `picomatch@4.0.7`; npm has no fixed release compatible with the TypeScript 6 toolchain. |
| REM-010 | T1 | Medium, required modernization | TypeScript resolver | Replace deprecated Node10 resolution with paired `module: Node16` and `moduleResolution: Node16`, retaining CommonJS behavior. | After dependency baseline | no-emit check; emitted entry inspection; tests | VERIFIED — TypeScript build and emitted CommonJS entry pass under Node16 resolution on Node 24 and 26. |
| REM-011 | T2 | Medium, required modernization | TypeScript compiler | Move to the supported TypeScript 6 line with a compatible typescript-eslint version; do not move to TypeScript 7. | REM-010 | lint; no-emit; build; tests | VERIFIED — TypeScript `6.0.3` with typescript-eslint `8.73.0` passes lint, build, and 50 tests. |
| REM-012 | CQ-009 | Medium, promoted | Database migrations | Introduce versioned/atomic migrations only through the protected backup-first workflow. | Production-shaped schema copies and explicit approval | Historical-schema migration matrix; integrity and FK checks | IMPLEMENTED / LOCAL VERIFIED — the runner accepts an explicit connection, records ordered migrations, wraps each migration and ledger insert atomically, rejects unknown schemas and duplicate owners, and passes historical-fixture, rollback, integrity, foreign-key, idempotency, backup, and restore tests. Production-shaped validation remains required before deployment. |

## Conditional findings investigated

| ID | Sources | Severity | Subsystem | Investigation result / action | Verification | Status |
|---|---|---|---|---|---|---|
| REM-013 | CQ-010 | Medium | Error handling | Interaction expiry and avatar fallback diagnostics overlap REM-004. Dormant interface/TTS catches are not on the active runtime path and are not broadened into this task. | Error-path unit tests and active-path logging review | VERIFIED — active expiry logging and bounded avatar fallback are covered; dormant catches remain excluded. |
| REM-014 | CQ-011, D-2 | Low / configuration risk | Gateway intents | Static inspection suggests `GuildMembers` may be unnecessary, but the audit requires live uncached-member testing before removal. | Live generator, transfer, permit/reject, invite, and admin-role checks | BLOCKED — production/test Discord connections are outside this task. No code change is safe from static evidence alone. |
| REM-015 | CQ-007 | Medium | Dormant/legacy surface | The duplicate surface is maintainability debt, not a present correctness defect. File deletion is explicitly prohibited without confirmation; compatibility cleanup hooks still have active callers. | Legacy row/component inventory and live stale-message checks | NOT APPLICABLE — excluded from required remediation; retain clearly documented dormant behavior. |
| REM-016 | CQ-008 | Medium | Architecture | Large hubs are real but the audit classifies extraction as optional and no required fix depends on a broad split. | Characterization tests if later changed | NOT APPLICABLE — cosmetic/structural refactor excluded. |
| REM-017 | CQ-012 | Low | Type boundaries/tests | Assertions are localized and strict compilation passes; broad test-double refactoring has no demonstrated functional impact. | Compiler plus focused fake updates during future library work | NOT APPLICABLE — optional quality improvement excluded. |
| REM-018 | CQ-013 | Low | Logging | Synchronous logging is a small-scale operational limitation, not a confirmed outage in current use. | Disk-failure/load test if operational evidence emerges | NOT APPLICABLE — optional operational improvement excluded. |
| REM-019 | CQ-014 | Low | Dormant TTS persistence | Partial upsert semantics are latent and the product has intentionally disabled TTS. | Repository regression test before any TTS reactivation | NOT APPLICABLE — defer until TTS is deliberately reactivated. |
| REM-020 | CQ-015 | Low | Type architecture | Type-only cycle has no runtime effect and should move only with related extraction. | Build and focused panel/text tests | NOT APPLICABLE — optional refactor excluded. |

## Modernization items excluded or superseded

| ID | Sources | Classification | Reason | Status |
|---|---|---|---|---|
| REM-021 | D-1, C3 | Functional compatibility claim | TTS intake is intentionally disabled in the active product: slash registration, event registration, and message intents were deliberately removed. Restoring it would be a feature reactivation and require Developer Portal changes/live validation, not remediation of active behavior. | NOT APPLICABLE |
| REM-022 | D-5, A2 | Optional API/UX | Explicit guild command contexts are useful but D-5 labels this optional; implementing it would require command re-registration to affect Discord. | NOT APPLICABLE |
| REM-023 | B2 | Breaking dependency migration | `better-sqlite3` 13 is unnecessary while current 12.x supports Node 24 and newer 12.x also supports the audit host. Major native/database migrations are protected. | NOT APPLICABLE |
| REM-024 | B3 | Optional dependency majors | ESLint 10, dotenv 18, globals 17, TypeScript 7, and type-package majors add churn without fixing a confirmed active defect. | NOT APPLICABLE |
| REM-025 | O1 | Optional operations | A new compatibility-preflight command would be useful but is explicitly optional and not needed once the standard test/native smoke gates work. | NOT APPLICABLE |

## Final totals

- Required findings: 12.
- Verified required findings: 7.
- Implemented and locally verified, pending release evidence: 4.
- Blocked required findings: 1.
- Not-applicable required findings: 0.
- Remaining required findings without a terminal status: 0.
- Conditional/excluded findings: 1 verified, 1 blocked, 11 not applicable.

REM-003, REM-005, REM-006, and REM-012 are implemented and locally verified under explicit protected-area authorization. They remain release-gated by disposable Discord validation or a production-shaped database copy. REM-009 remains blocked on an upstream fixed package release.

**In simple terms:** The four protected fixes now pass local failure tests, but real Discord permissions and a copied production-shaped database must still be checked before release.

## Validation log

- 2026-11-18 baseline: host Node `26.13.0`, npm `12.2.1`; `npm audit --json` reported 17 affected nodes (8 high, 8 moderate, 1 low).
- 2026-11-18 baseline: installed `better-sqlite3@12.9.0` had no Node 26 ABI binding; the repository remains contractually pinned to Node 24.
- 2026-11-18 documentation check: Context7 confirmed early interaction deferral, immutable ephemeral state, `MessageFlags.Ephemeral`, and paired Node16 TypeScript module settings. npm metadata for `@discordjs/voice@0.19.2` reports Node `>=22.12`; the 0.19.0 rendered docs state Node 24.17+, so the stricter Node 24.18 project baseline remains appropriate.
- 2026-11-18 final local gate: native SQLite smoke, `npm run lint`, `npm run build`, and all 50 tests passed both on the audited Node 26 host and in an isolated clean Node 24.18.0 copy.
- 2026-11-18 security gate: `npm audit --omit=dev` reported zero vulnerabilities. Full `npm audit` reported nine development-only high nodes blocked on an unpublished `picomatch` fix; no force fix was used.
- 2026-11-18 voice dependency report: DAVE and native AES-256-GCM are available; FFmpeg and Opus are absent. TTS remains intentionally disabled.
- 2026-11-18 protected remediation gate: Context7 reconfirmed discord.js overwrite behavior, Discord permission precedence, and better-sqlite3 transaction rollback semantics. Lint, build, and all 82 tests pass locally; no production Discord or database resource was accessed.

**In simple terms:** This file separates fixes that can be completed safely now from changes that need live Discord access or explicit approval for protected database and permission behavior.
