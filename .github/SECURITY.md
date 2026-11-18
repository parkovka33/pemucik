# Security Policy

## Overview
Pemucik is an executable Discord bot. Security issues here can affect bot tokens, Discord server permissions, temporary channel safety, and operator trust.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ Yes            |
| < 0.1   | ❌ No             |

## Security best practices

### Secrets
- Never commit `.env` files, bot tokens, or client secrets
- Rotate the Discord bot token immediately if it is exposed
- Do not paste live secrets into GitHub issues

### Discord permissions
- Grant only the permissions the MVP needs
- Review bot role placement when channel or overwrite edits fail
- Be careful with `Administrator`; it is useful for testing, but broader than production minimums

### Channel safety
- Pemucik should never delete a channel unless it is confirmed in SQLite `temp_channels`
- Permission overwrite edits should stay targeted and must not wipe unrelated overwrites
- Cleanup changes should always be tested against the manual Discord verification loop

### Local operations
- Keep the SQLite database out of commits
- Review logs before sharing them publicly because they may contain guild, user, or channel IDs

## Reporting a vulnerability

If you discover a security issue in Pemucik:

1. Do **not** open a public issue with secrets or exploit details
2. Use GitHub private vulnerability reporting for this repository if available
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Scope
This security policy covers:
- bot token exposure
- unsafe permission handling
- deletion of non-temporary channels
- stale or inconsistent temp-channel ownership state that can cause unsafe control behavior

This policy does not cover:

- Discord platform-wide vulnerabilities
- issues in third-party services outside this repository
