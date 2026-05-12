# Product Requirements

Historical note:
This file captures the original MVP product baseline.
The current repository has already moved somewhat beyond that baseline, so use this file for product intent and guardrails, and use `README.md` plus `MEMORY.md` for the current live command surface.

## Product Overview
- **App Name:** XenoVoice
- **Version:** MVP
- **One-line description:** XenoVoice helps Discord servers create temporary voice rooms on demand, without server clutter and without aggressive premium paywalls.
- **Tagline:** Free-first temporary voice channels for Discord communities.
- **Primary platform:** Discord only
- **Launch goal:** Bring the MVP to a working, testable state.
- **Target launch:** 1–2 weeks
- **Budget constraint:** Maximum $10/month for hosting and infrastructure

## Primary User Story
“Meet Alex, an admin of a creator/community Discord server. Members often want to start quick voice chats, but the server becomes cluttered if Alex creates many permanent channels. Alex adds XenoVoice and sets up one Join-to-Create channel. Now users join that channel, XenoVoice creates a temporary voice room for them, and the channel disappears when empty. The server stays clean, users get flexible voice spaces, and Alex does not need to manage everything manually.”

## Who It Is For
### Primary User
Community Discord server admins and owners who manage active servers where members want spontaneous voice chats.

### Best-fit Communities
- Russian-speaking Discord servers
- English-speaking Discord servers
- Mixed-language communities
- Creator/community servers
- Casual gaming, hobby, study, fan, or social servers

### Current Pain
- Permanent voice channels clutter the server
- Empty channels make the server look messy or inactive
- Users want quick private or semi-private voice spaces without asking admins
- Admins do not want to manually create and delete voice channels
- Existing temp voice bots often hide useful controls behind premium plans

### What They Need
- A simple Join-to-Create voice channel
- Automatic temporary voice channel creation
- Automatic cleanup when channels are empty
- Basic user controls without a web dashboard
- A free-first tool that feels fair, friendly, and community-focused

## Must-Have MVP Features

### 1. Join-to-Create Temporary Voice Channel
- **What:** Admin creates a special voice channel. When a user joins it, XenoVoice creates a new temporary voice channel.
- **User Story:** As a server member, I want to join one channel and automatically get my own voice room so that I can start talking without waiting for an admin.
- **Priority:** P0 — Critical
- **Success Criteria:**
  - Admin can configure one Join-to-Create channel
  - Bot detects when a user joins the generator channel
  - Bot creates a new voice channel in the correct category
  - Bot moves the user into the new channel
  - Bot handles errors with a friendly message or log

### 2. Auto-Delete Empty Temporary Channels
- **What:** XenoVoice deletes temporary voice channels when they become empty.
- **User Story:** As an admin, I want unused temporary channels to disappear automatically so that my server stays clean.
- **Priority:** P0 — Critical
- **Success Criteria:**
  - Bot detects when a temporary channel becomes empty
  - Bot waits a short safety delay before deleting
  - Bot does not delete non-temporary channels
  - Bot handles cases where the channel was manually deleted

### 3. Channel Ownership
- **What:** The user who creates the temporary channel becomes its owner/controller.
- **User Story:** As the creator of a temporary channel, I want basic control over my room so that I can manage the conversation.
- **Priority:** P0 — Critical
- **Success Criteria:**
  - Bot stores the owner ID for each temporary channel
  - Only the owner can use owner controls
  - Admins can override owner controls
  - Ownership is removed when the channel is deleted

### 4. Discord-Native Control Panel
- **What:** A control panel using Discord buttons, dropdowns/select menus, modals, and embeds.
- **User Story:** As a channel owner, I want to control my temporary voice room inside Discord so that I do not need a website.
- **Priority:** P0 — Critical
- **Success Criteria:**
  - `/panel` opens or sends the owner control panel
  - Panel uses embeds and interactive components
  - Rename opens a modal
  - Lock/unlock works through buttons
  - User limit can be changed through modal or select menu

### 5. Basic Owner Controls
#### Rename Channel
- Owner can submit a new name
- Bot validates length and unsafe/empty names
- Bot renames the Discord voice channel

#### Lock / Unlock Channel
- Lock prevents general members from connecting
- Unlock restores default connection behavior
- Bot does not break admin permissions

#### Set User Limit
- Owner can choose or enter a limit
- Bot updates the voice channel user limit
- Bot handles invalid values

- **Priority:** P0 — Critical

## Nice to Have Soon After MVP
- Claim ownership
- Transfer ownership
- Permit user or role
- Reject user or role
- Request to join locked room
- Temporary text channel
- Linked text-to-speech for tracked temp rooms through a narrow local Piper-based room-level toggle
- Channel status message
- Bitrate controls
- Ghost / unghost visibility
- NSFW room toggle
- Region override
- Multilingual UI
- Multiple generators
- Persistent `/interface` control channel
- Advanced `/setup default` options
- `/reset` for defaults like bitrate and related controls
- Default bitrate setting

## NOT in MVP
- Ghost/invisible channel toggle
- Bitrate control
- Custom voice status
- LFM / Looking for Members messages
- Custom embeds/buttons/dropdowns
- Role-based toggles
- Temporary roles
- Setup templates

## Success Metrics
### First 30 Days
- **Servers installed:** 5–10 test servers
- **Temporary channels created:** 100+ total
- **Successful channel creation rate:** 95%+
- **7-day active servers:** 30–50% of test servers
- **Supporter clicks / donation interest:** any signal is useful

### MVP Definition of Success
The MVP is successful if:
- a new admin can set up XenoVoice without help
- a user can create a temporary voice channel by joining the generator
- the creator can rename, lock/unlock, and set a user limit
- empty temporary channels are deleted reliably
- the bot runs 24/7 within the $10/month budget
- at least a few real servers use it for testing

## UI / UX Requirements
- **Design vibe:** clean, friendly, lightweight, community-first, not corporate
- **Principles:**
  - Simple first
  - Friendly tone
  - Low clutter
  - Discord-native
  - Free-first trust

## Discord Surfaces
- `/setup` — admin creates or updates generator/category defaults, including newer persisted setup options
- `/voice ...` — current grouped room controls for rename, lock, unlock, limit, claim, transfer, permit, reject, request, bitrate, ghost, unghost, nsfw, and region
- `/set bitrate` — admin default bitrate override for new temporary rooms
- `/reset bitrate` — clear the default bitrate override
- `/interface` — create or refresh the persistent channel control interface
- `/help` — setup, usage, troubleshooting
- `/support` — support and donation links
- `/panel` — historical/internal control concept, not the main public slash-command surface anymore

## Remaining Post-MVP Command Goals
- `/voice status` — set a room status message
- `/voice tts` — enable or disable room-level text-to-speech for a tracked linked temp text channel and choose a curated local Piper voice preset
- `/settings` — admin views or updates guild settings through a clearer dedicated surface
- `/language` — later, server language selection
- `/setup default` — a richer dedicated admin flow for setup defaults if `/setup` itself becomes too crowded

## Launch Phases
### Phase 1 — Private Test
- Test on 1 personal/private server
- Test with 2–5 friendly community servers
- Ask admins to try setup without help
- Track bugs manually

### Phase 2 — Small Beta
- Create support server
- Add `/help`
- Add `/support`
- Create short demo GIF
- Invite 5–10 more servers

### Phase 3 — Public Listing Prep
- Write clear bot description
- Add screenshots/GIFs
- Create basic documentation inside Discord or README
- Submit to bot lists only after the bot is stable

## Timeline Constraints
- First working MVP in 1–2 weeks
- No website
- No custom domain
- No expensive external database
- Discord-only UX
- Beginner-friendly infrastructure
- Built with AI assistance

## Quality Standards
The product must not:
- use placeholder production text
- ship half-working features
- rely on a setup flow only the developer understands
- delete channels XenoVoice did not create
- break admin permissions
- ignore Discord API rate limits
- require a website for MVP
- push premium before trust is built

## Core Testing Checklist
### Core Flow
- Admin can invite bot
- Admin can run `/setup`
- Join-to-Create channel is created
- User joins generator channel
- Bot creates temporary voice channel
- Bot moves user into channel
- Bot stores channel owner
- Empty channel is deleted
- Database row is removed after deletion

### Control Panel
- Owner can open `/panel`
- Non-owner cannot control someone else’s channel
- Admin can override
- Rename works
- Lock works
- Unlock works
- User limit works

### Safety
- Bot does not delete normal voice channels
- Bot handles missing permissions
- Bot handles deleted generator channel
- Bot handles deleted temp channel
- Bot handles user leaving before move
- Bot does not create multiple channels for one user
- Cooldown prevents spam

### Deployment
- Bot restarts after crash
- Token is not committed to GitHub
- SQLite database persists
- Logs are accessible
- Basic backup exists
