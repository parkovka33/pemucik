# Pemucik Release Checklist

Use this checklist before calling Pemucik ready for public bot-directory submission or a broader outreach push.

## 1. Repository readiness

- [ ] [README.md](../README.md) matches the actual shipped MVP behavior.
- [ ] [docs/listing.md](./listing.md) does not promise post-MVP features.
- [ ] [docs/quickstart.md](./quickstart.md) and [docs/troubleshooting.md](./troubleshooting.md) reflect the current setup and support flow.
- [ ] `.github` FAQ/support/issue templates are aligned with Pemucik rather than the old repo template.
- [ ] Any remaining template-era files are either cleaned up or consciously left for a later pass.

## 2. Code and command checks

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run commands:register` if slash command definitions changed
- [ ] `npm run db:migrate` if DB schema or migration logic changed

## 3. Manual Discord verification

Run the real Discord loop from [agent_docs/testing.md](../agent_docs/testing.md).

- [ ] `/setup` creates or reuses the Pemucik category and generator channel
- [ ] joining the generator creates a tracked temp room
- [ ] the member is moved into the temp room
- [ ] `/voice rename`, `/voice lock`, `/voice unlock`, and `/voice limit` work for the owner
- [ ] `/voice claim` is denied or allowed correctly based on room state
- [ ] rename works
- [ ] lock works when the bot has sufficient permissions
- [ ] unlock works without wiping unrelated overwrites
- [ ] user limit changes work
- [ ] empty tracked temp rooms are deleted after the cleanup delay
- [ ] normal voice channels are never deleted
- [ ] a bot restart does not break existing persisted state

## 4. Support and operator readiness

- [ ] `/help` copy is accurate for the current product surface
- [ ] `/support` behaves correctly with configured links
- [ ] `/support` still has acceptable fallback copy when support or donation URLs are not configured
- [ ] known permission failure modes are documented in [docs/troubleshooting.md](./troubleshooting.md)

## 5. Listing readiness

- [ ] choose one short description from [docs/listing.md](./listing.md)
- [ ] choose one long description from [docs/listing.md](./listing.md)
- [ ] verify listing bullets do not mention unsupported features
- [ ] verify current language expectations are honest
- [ ] verify one-generator-per-server MVP limitation is not hidden if the bot list needs that context
- [ ] confirm whether support and donation links should be exposed publicly

## 6. Known constraints to state honestly

- [ ] one generator channel per server
- [ ] Discord-only UX, no web dashboard
- [ ] Russian-first Discord-facing copy in the current MVP
- [ ] advanced `/voice ...` controls and admin defaults are described accurately if they are exposed in the current release

## 7. Final release note

Before public submission, record:

- what was verified live in Discord
- what was only checked locally
- any known non-blocking limitations
- what remains for the next phase
