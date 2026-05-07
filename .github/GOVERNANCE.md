# Governance

This document describes how decisions are made for the XenoVoice repository.

## Scope

Governance applies to:

- bot code under `src/` and `scripts/`
- operator and product docs under `README.md`, `docs/`, `agent_docs/`, `AGENTS.md`, and `MEMORY.md`
- community health and workflow files under `.github/`

## Roles

### Maintainer

- reviews and merges pull requests
- decides MVP scope and release timing
- resolves disagreements when async discussion does not converge

### Contributor

- proposes focused code or docs changes through issues and pull requests
- respects current MVP scope and safety constraints
- includes verification notes for behavior changes

## Decision-making model

XenoVoice uses a lightweight, safety-first model:

- small fixes: maintainer review and merge
- larger changes: open an issue or draft PR first when behavior, docs surface, or workflows change materially
- safety-sensitive work: cleanup, permissions, ownership, and deletion behavior should err on conservative review

## Change categories

- **Editorial:** copy fixes, clarification, broken links, translation cleanup
- **Operational:** repo docs, issue templates, workflow files, listing preparation
- **Behavioral:** slash commands, temp-room lifecycle, permissions, persistence, or support UX

Behavioral and safety-sensitive changes should include:

- the reason for the change
- verification notes (`npm run lint`, `npm run build`, and manual Discord checks when relevant)
- updates to operator-facing docs when behavior or support expectations changed

## Release readiness

Before broader outreach or bot-directory submission:

- use [docs/RELEASE-CHECKLIST.md](../docs/RELEASE-CHECKLIST.md)
- keep public docs aligned with the shipped MVP
- state known constraints honestly rather than implying planned features already exist

## Conduct and enforcement

Community behavior follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security and sensitive reports

Security issues must follow [SECURITY.md](SECURITY.md) and should not be filed as public issues.
