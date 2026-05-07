# Contributing to XenoVoice

Pull requests and issue reports are welcome.

This repository contains the XenoVoice Discord bot codebase and its supporting docs.

## Before you start

- Read `AGENTS.md`, `README.md`, and the docs under `agent_docs/` to understand the current phase and constraints.
- Review the Code of Conduct (CODE_OF_CONDUCT.md). By participating, you agree to follow it.

## How to propose changes

### Bug reports / issues

- Use GitHub Issues.
- Include:
  - What you were trying to do.
  - The exact command, interaction, or file involved.
  - What went wrong.
  - Discord permission and server context when relevant.

### Suggesting improvements

Good candidates for contributions:

- Narrow bug fixes.
- Clearer onboarding or troubleshooting docs.
- Safer handling around Discord permissions, ownership checks, or cleanup.
- Better logs and operator-facing diagnostics.
- Fixes for Russian-first Discord copy when the current behavior is wrong or unclear.

Out of scope (will usually be closed):

- New MVP-external product features.
- Web dashboard work.
- Premium/paywall features.
- Risky changes to cleanup safety or DB deletion logic without a clear review path.

Open an issue first for any **large** change so we can agree on direction.

## Pull request guidelines

- Fork the repo and create a feature branch.
- Keep PRs focused and small where possible.
- Update any relevant docs (`README.md`, `docs/`, `agent_docs/`, `MEMORY.md`) when behavior or operator guidance changes.
- Add a short description explaining:
  - What changed.
  - Why it helps XenoVoice operators or users.
  - Any behavior or safety trade-offs.

Maintainers may ask for tweaks before merging.

## Style and formatting

- Use clear, concise English.
- Prefer actionable, step-by-step instructions.
- Follow the existing heading hierarchy and Markdown style in the repo.
- Keep changes aligned with the current MVP phase in `AGENTS.md`.

## Code of Conduct

This project follows the Contributor Covenant Code of Conduct (see `CODE_OF_CONDUCT.md`).  
Report unacceptable behavior to the contact address listed there.
