# Product Requirements Document: XenoVoice MVP

Historical note:
This PRD is the MVP foundation document.
The live repository has since moved into post-MVP stabilization and polish, so some current commands and behaviors now extend beyond this strict MVP description.
Use [README.md](/home/xenovoicik/xenovoice/README.md) and [MEMORY.md](/home/xenovoicik/xenovoice/MEMORY.md) for the current shipped command surface.

## Product Overview

**App Name:** XenoVoice  
**Version:** MVP  
**Document Status:** Draft — ready for technical design  
**Created:** 4 May 2026  
**Target User Level:** Vibe-coder / solo founder  
**Primary Platform:** Discord only  
**Website:** Not required for MVP  
**Custom Domain:** Not required for MVP  

**Tagline:**  
Free-first temporary voice channels for Discord communities.

**One-line Description:**  
XenoVoice helps Discord servers create temporary voice rooms on demand, without server clutter and without aggressive premium paywalls.

**Launch Goal:**  
Bring the MVP to a working, testable state.

**Target Launch:**  
1–2 weeks.

**Budget Constraint:**  
Maximum $10/month for hosting and infrastructure.

---

## Source Notes

This PRD is based on the uploaded research file for the Discord temporary voice channel bot concept, including the free-first positioning, target users, MVP feature list, budget, timeline, and post-MVP ideas.

Technical feasibility assumptions are based on current Discord documentation. Discord officially supports application commands/interactions, message components, modals, channel permission overwrites, voice channel fields such as `user_limit`, and API rate limits that must be respected.

**Source URLs accessed 4 May 2026:**

- Discord Interactions Overview: https://docs.discord.com/developers/interactions/overview
- Discord Interactions & Commands: https://docs.discord.com/developers/platform/interactions
- Discord Application Commands: https://docs.discord.com/developers/interactions/application-commands
- Discord Components Reference: https://docs.discord.com/developers/components/reference
- Discord Components & Modals: https://docs.discord.com/developers/platform/components
- Discord Permissions: https://docs.discord.com/developers/topics/permissions
- Discord Channel Resource: https://docs.discord.com/developers/resources/channel
- Discord Rate Limits: https://docs.discord.com/developers/topics/rate-limits

---

## Who It's For

### Primary User: Community Server Admin

XenoVoice is for Discord server owners and admins who manage active communities where members often want to jump into voice chats spontaneously.

**Best-fit communities:**

- Russian-speaking Discord servers
- English-speaking Discord servers
- Mixed-language communities
- Creator/community servers
- Casual gaming, hobby, study, fan, or social servers

### Their Current Pain

- Permanent voice channels clutter the server.
- Empty voice channels make the server look messy or inactive.
- Users want quick private/semi-private voice spaces without asking admins.
- Admins do not want to manually create and delete voice channels.
- Existing temporary voice bots solve the problem, but many useful features are hidden behind premium plans.

### What They Need

- A simple “Join to Create” voice channel.
- Automatic temporary voice channel creation.
- Automatic cleanup when channels are empty.
- Basic user controls without needing a web dashboard.
- A free-first tool that feels fair, friendly, and community-focused.

---

## Example User Story

“Meet Alex, an admin of a creator/community Discord server. Members often want to start quick voice chats, but the server becomes cluttered if Alex creates many permanent channels. Alex adds XenoVoice and sets up one Join-to-Create channel. Now users join that channel, XenoVoice creates a temporary voice room for them, and the channel disappears when empty. The server stays clean, users get flexible voice spaces, and Alex does not need to manage everything manually.”

---

## The Problem We're Solving

Discord communities need spontaneous voice spaces, but permanent voice channels create clutter. Admins want automation, users want flexibility, and both groups want the experience to stay simple.

XenoVoice solves this by creating temporary voice channels only when needed and deleting them when they are no longer used.

### Why Existing Solutions Fall Short

| Existing Solution Type | Problem |
|---|---|
| Permanent voice channels | Clutter the server and require manual cleanup |
| Manual admin-created channels | Slow and inconvenient for users |
| Existing temp voice bots | Useful, but many advanced controls are often premium-only |
| Web-dashboard-first tools | Add unnecessary complexity for a simple MVP |

### XenoVoice Differentiation

XenoVoice should feel like:

> “A clean, friendly, free-first Discord bot for temporary voice rooms — useful from day one, without pushing users into premium.”

---

## Product Positioning

### Core Positioning

**XenoVoice is the free-first temporary voice channel bot for Discord communities.**

The main message should be:

- Most useful temporary voice features should be free.
- Monetization should be donation-first, not paywall-first.
- The bot should work fully inside Discord.
- Setup should be simple enough for non-technical admins.
- The interface should feel clean, friendly, and lightweight.

### Unique Selling Proposition

**“Temporary voice channels that stay simple, useful, and free-first.”**

### Launch Messaging Options

| Message | Use Case |
|---|---|
| “Temporary voice channels without the premium pressure.” | Landing/listing tagline |
| “Keep your Discord server clean with auto-created voice rooms.” | Admin-focused description |
| “Join, talk, leave — XenoVoice cleans up automatically.” | Simple user-facing explanation |
| “Built for communities, supported by donations.” | Free-first positioning |
| “No website needed. Manage everything inside Discord.” | Discord-native benefit |

---

## User Journey

### Discovery → First Use → Success

#### 1. Discovery Phase

**How they find XenoVoice:**

- Recommendation from another server admin
- Discord bot listing
- Support server
- Short demo GIF/video
- Community founder/creator posts

**What catches attention:**

- Free-first positioning
- Simple setup
- No web dashboard required
- Temporary voice channels that auto-clean

**Decision trigger:**

- Admin is tired of messy voice categories.
- Admin wants a VoiceMaster/TempVoice-like experience without aggressive premium limits.

#### 2. Onboarding — First 5 Minutes

**Admin does:**

1. Invites XenoVoice to the Discord server.
2. Runs `/setup`.
3. Selects or creates a category.
4. Creates a Join-to-Create channel.
5. Sets default channel naming and user limit.
6. Confirms setup.

**Quick win:**  
A user joins the generator channel, and XenoVoice immediately creates a temporary voice channel.

#### 3. Core Usage Loop

**Trigger:**  
A user wants to talk with friends/community members.

**Action:**  
They join the Join-to-Create voice channel.

**Reward:**  
XenoVoice creates a temporary channel and moves the user into it.

**Control:**  
The creator can rename, lock/unlock, or set a user limit from a Discord-native panel.

**Cleanup:**  
When everyone leaves, XenoVoice deletes the empty temporary channel.

#### 4. Success Moment

The “aha!” moment happens when an admin sees:

- The server stays clean.
- Users create voice rooms without admin help.
- Empty rooms disappear automatically.
- Basic controls work inside Discord.

---

## MVP Features

### Must Have for Launch

#### 1. Join-to-Create Temporary Voice Channel

- **What:** Admin creates a special voice channel. When a user joins it, XenoVoice creates a new temporary voice channel.
- **User Story:** As a server member, I want to join one channel and automatically get my own voice room so that I can start talking without waiting for an admin.
- **Success Criteria:**
  - [ ] Admin can configure one Join-to-Create channel.
  - [ ] Bot detects when a user joins the generator channel.
  - [ ] Bot creates a new voice channel in the correct category.
  - [ ] Bot moves the user into the new channel.
  - [ ] Bot handles errors with a friendly message or log.
- **Priority:** P0 — Critical

#### 2. Auto-Delete Empty Temporary Channels

- **What:** XenoVoice deletes temporary voice channels when they become empty.
- **User Story:** As an admin, I want unused temporary channels to disappear automatically so that my server stays clean.
- **Success Criteria:**
  - [ ] Bot detects when a temporary channel becomes empty.
  - [ ] Bot waits a short safety delay before deleting.
  - [ ] Bot does not delete non-temporary channels.
  - [ ] Bot handles cases where the channel was manually deleted.
- **Priority:** P0 — Critical

#### 3. Channel Ownership

- **What:** The user who creates the temporary channel becomes its owner/controller.
- **User Story:** As the creator of a temporary channel, I want basic control over my room so that I can manage the conversation.
- **Success Criteria:**
  - [ ] Bot stores the owner ID for each temporary channel.
  - [ ] Only the owner can use owner controls.
  - [ ] Admins can override owner controls.
  - [ ] Ownership is removed when the channel is deleted.
- **Priority:** P0 — Critical

#### 4. Discord-Native Control Panel

- **What:** A control panel using Discord buttons, dropdowns/select menus, modals, and embeds.
- **User Story:** As a channel owner, I want to control my temporary voice room inside Discord so that I do not need a website.
- **Success Criteria:**
  - [ ] `/panel` opens or sends the owner control panel.
  - [ ] Panel uses embeds and interactive components.
  - [ ] Rename opens a modal.
  - [ ] Lock/unlock works through buttons.
  - [ ] User limit can be changed through modal or select menu.
- **Priority:** P0 — Critical

#### 5. Basic Owner Controls

##### Rename Channel

- **What:** Owner can rename their temporary voice channel.
- **Success Criteria:**
  - [ ] Owner can submit a new name.
  - [ ] Bot validates length and unsafe/empty names.
  - [ ] Bot renames the Discord voice channel.

##### Lock / Unlock Channel

- **What:** Owner can lock the channel so new users cannot join, then unlock it again.
- **Success Criteria:**
  - [ ] Lock prevents general members from connecting.
  - [ ] Unlock restores default connection behavior.
  - [ ] Bot does not break admin permissions.

##### Set User Limit

- **What:** Owner can set a maximum number of users in the channel.
- **Success Criteria:**
  - [ ] Owner can choose or enter a limit.
  - [ ] Bot updates the voice channel user limit.
  - [ ] Bot handles invalid values.

- **Priority:** P0 — Critical

---

## Nice to Have Soon After MVP

These are useful, but not required for the first working MVP.

| Feature | Why Useful | Why Not MVP |
|---|---|---|
| Claim ownership | Helps if original owner leaves | Adds edge cases |
| Transfer ownership | Useful for communities | Needs more permission logic |
| Permit user or role | Lets owners explicitly allow trusted members or roles | More complex overwrites |
| Reject user or role | Lets owners reject or kick specific members or roles | More complex overwrites and safety checks |
| Request to join locked room | Improves UX for closed rooms | Needs request/review flow and anti-spam handling |
| Temporary text channel | Popular feature | Adds cleanup and linking complexity |
| Channel status message | Improves room discoverability and context | Not core to safe create/control/cleanup loop |
| Bitrate controls | Useful for quality tuning | Requires guild-tier awareness and safe limits |
| Ghost / unghost visibility | Strong privacy value | More permission edge cases |
| NSFW room toggle | Useful for age-restricted communities | Needs safer moderation defaults |
| Region override | Useful for international communities | Not core and may depend on Discord behavior |
| Multilingual UI | Important for RU/EN audience | Can start with English or Russian first |
| Multiple generators | Useful for larger servers | Adds setup complexity |
| `/interface` management channel | Gives users a persistent in-server control surface | Adds component lifecycle/state complexity |
| Advanced `/setup default` options | Lets admins choose editable mode, category, and permission source | Adds setup complexity and more validation paths |
| `/reset` for room defaults | Helps admins recover from bad defaults or experiments | Requires clear reset scope and safe UX |
| Default bitrate setting | Useful for community-wide voice quality defaults | Adds guild-level settings surface |

---

## NOT in MVP

These should wait until the core flow is stable.

| Feature | Reason to Wait |
|---|---|
| Ghost/invisible channel toggle | More permission edge cases |
| Bitrate control | Less important than rename/lock/limit |
| Custom voice status | Nice but not core |
| LFM / Looking for Members messages | Adds moderation/spam concerns |
| Custom embeds/buttons/dropdowns | Requires customization system |
| Role-based toggles | More complex settings |
| Temporary roles | More permission risk |
| Setup templates | Useful later, not necessary now |
| Web dashboard | Explicitly not a priority |

*Why we are waiting:*  
The first version should prove the core value: create temporary voice channels, give the creator basic control, and clean up reliably.

### Post-MVP command roadmap

Once XenoVoice moves beyond strict MVP scope, the command roadmap should support these Discord-native surfaces:

- `/voice permit` — allow a specific user or role to join the temporary room
- `/voice reject` — reject or kick a specific user or role from the temporary room
- `/voice status` — set the room status message
- `/voice bitrate` — set the room bitrate in kbps within safe guild limits
- `/voice ghost` — hide the temporary room
- `/voice unghost` — make the temporary room visible again
- `/voice nsfw` — toggle the room NSFW/age-restricted setting when Discord supports it for the channel type
- `/voice transfer` — transfer room ownership to another member
- `/voice region` — set or override the room region when Discord supports it
- `/voice request` — request to join a temporary room
- `/setup default` — create/configure Join-to-Create defaults with options like `editable`, `category`, and permission-source behavior
- `/reset` — reset selected room or guild defaults such as bitrate and related control values
- `/set bitrate` — set the default bitrate for newly created temporary rooms
- `/interface` — create a persistent room-control interface channel for temp-room management

---

## How We'll Know It's Working

### Launch Success Metrics — First 30 Days

| Metric | Target | Measure |
|---|---:|---|
| Servers installed | 5–10 test servers | Bot guild count |
| Temporary channels created | 100+ total | Internal event counter |
| Successful channel creation rate | 95%+ | Success / attempted creations |
| 7-day active servers | 30–50% of test servers | Server creates at least one channel again within 7 days |
| Supporter clicks / donation interest | Any signal is useful | `/support`, Ko-fi/Patreon clicks, support server interest |

### MVP Definition of Success

The MVP is successful if:

- A new admin can set up XenoVoice without help.
- A user can create a temporary voice channel by joining the generator.
- The creator can rename, lock/unlock, and set a user limit.
- Empty temporary channels are deleted reliably.
- The bot runs 24/7 within the $10/month budget.
- At least a few real servers use it for testing.

---

## Look & Feel

**Design Vibe:**  
Clean, friendly, lightweight, community-first, not corporate.

### Visual Principles

1. **Simple first** — every command should be understandable without reading long docs.
2. **Friendly tone** — messages should feel helpful, not robotic.
3. **Low clutter** — embeds should be short, clean, and action-oriented.
4. **Discord-native** — users should not feel forced to leave Discord.
5. **Free-first trust** — avoid language that feels like upselling.

---

## Key Screens / Discord Surfaces

Since there is no website, “screens” are Discord commands, embeds, and panels.

| Surface | Purpose |
|---|---|
| `/setup` | Admin creates the generator channel and default settings |
| `/panel` | Owner opens controls for their temporary voice channel |
| `/voice ...` | Later: grouped owner/admin controls for advanced temp-room actions |
| `/settings` | Admin views or updates server settings |
| `/language` | Later: choose server language |
| `/help` | Explain setup, usage, and troubleshooting |
| Support embed | Link to support server and donation page |

---

## Discord-Only Dashboard Design

### Admin Setup Flow

**Command:** `/setup`

#### Step 1 — Welcome Embed

```text
🌀 XenoVoice Setup

Create temporary voice channels for your server.

When users join your Join-to-Create channel, I will:
• create a private temporary voice room
• move them into it
• give them basic controls
• delete the room when empty

[Create Setup] [Cancel]
```

#### Step 2 — Category Selection

```text
Choose where temporary voice channels should be created.

Dropdown:
• Use current category
• Select existing category
• Create new category: XenoVoice
```

#### Step 3 — Generator Channel

```text
Create Join-to-Create Channel

Default name:
➕ Join to Create

[Create Channel] [Use Existing Channel]
```

#### Step 4 — Defaults

```text
Default Temporary Channel Settings

Name template:
{user}'s Room

Default user limit:
No limit / 2 / 5 / 10 / Custom

[Save Settings]
```

#### Step 5 — Success

```text
✅ XenoVoice is ready!

Users can now join:
➕ Join to Create

I will create temporary voice channels automatically.
```

---

### User Control Panel Flow

**Command:** `/panel`

Only works if the user owns a temporary voice channel.

```text
🎛️ XenoVoice Control Panel

Channel: Viktoria's Room
Owner: @Viktoria
Status: Unlocked
User Limit: No limit

Use the buttons below to manage your room.

[Rename] [Lock] [Unlock]
[Set Limit] [Refresh]
```

### Rename Modal

```text
Modal Title: Rename Voice Channel

Field:
New channel name
Example: Chill Room
```

### Set Limit Modal or Dropdown

```text
Set User Limit

Options:
• No limit
• 2 users
• 5 users
• 10 users
• Custom
```

---

## Technical Considerations

### Recommended MVP Tech Stack

| Area | Recommendation |
|---|---|
| Language | Node.js |
| Discord Library | discord.js |
| Database | SQLite |
| Hosting | Small VPS under $10/month |
| Logging | Console logs + simple file logs |
| Monitoring | Basic uptime monitor or VPS process manager |
| Dashboard | Discord commands only |

### Why This Stack Fits

Node.js with discord.js is a strong MVP path because Discord bots commonly use event-driven logic, and temporary voice channel creation depends heavily on reacting to Discord events. discord.js provides high-level objects for interactions, channels, permissions, voice states, and components, which makes it easier for an AI coding assistant to generate understandable code.

SQLite is enough for MVP because XenoVoice only needs to store lightweight settings and temporary channel mappings. A single VPS can run the bot and keep a local SQLite file, which stays within the $10/month constraint.

### Required Discord Permissions

The bot invite should request permissions similar to:

| Permission | Why Needed |
|---|---|
| Manage Channels | Create, edit, and delete temporary voice channels |
| Move Members | Move users from Join-to-Create into the temp channel |
| View Channels | See relevant categories/channels |
| Connect | Check voice channel behavior |
| Manage Roles / permission overwrites | Needed for channel-level permission overwrites such as lock/unlock |
| Send Messages | Send setup/help/panel messages |
| Use Slash Commands | Enable command-based setup |
| Embed Links | Send clean embeds |

### API Feasibility Table

| Feature | API Support | Needed Permissions | Difficulty | Notes |
|---|---|---|---|---|
| Create voice channel | Supported via guild channel creation | Manage Channels | Medium | Core MVP |
| Move user into channel | Supported through member voice movement | Move Members | Medium | Must handle failure if user leaves too fast |
| Detect user joins generator | Supported via voice state updates | Gateway events/intents | Medium | Core event logic |
| Detect empty temp channel | Supported by tracking voice states/channel members | View Channels | Medium | Add safety delay |
| Delete empty channel | Supported | Manage Channels | Easy/Medium | Must only delete bot-created temp channels |
| Rename channel | Supported through channel edit | Manage Channels | Easy | Validate names |
| Set user limit | Supported through voice channel `user_limit` | Manage Channels | Easy | Core MVP |
| Lock/unlock | Supported with permission overwrites | Manage Channels / permission overwrite ability | Medium | Avoid breaking admin permissions |
| Ghost/invisible mode | Supported with View Channel overwrites | Manage Channels / permission overwrites | Medium/Hard | Post-MVP |
| Temporary text channel | Supported | Manage Channels | Medium | Needs cleanup link |
| Buttons/dropdowns/modals | Supported through interactions/components | Slash commands / interactions | Medium | Discord-native dashboard |
| Rate limit handling | Required | N/A | Medium | Must not spam channel create/delete/edit requests |

---

## Data Storage

### Data to Store

| Data | Example |
|---|---|
| Guild/server settings | guild_id, language, category_id |
| Generator channel | join_to_create_channel_id |
| Temp channel ownership | temp_channel_id, owner_user_id |
| Default channel name | `{user}'s Room` |
| Default user limit | 0 / 2 / 5 / 10 |
| Feature toggles | lock_enabled, rename_enabled, limit_enabled |
| Metrics | channels_created, creation_failed, last_active_at |
| Donation/support clicks | support_command_used, donation_link_clicked |

### Recommended MVP Database

**Use SQLite for MVP.**

Why:

- Cheap/free.
- No external database account needed.
- Easy to back up.
- Good enough for early beta.
- Simple for a vibe-coder.
- Fits a single VPS deployment.

### Migration Path

| Stage | Storage |
|---|---|
| Local testing | JSON file or SQLite |
| MVP beta | SQLite |
| Growing usage | SQLite with backups |
| Larger production | PostgreSQL |
| Multi-instance bot | PostgreSQL required |

Avoid JSON files for serious beta because they can corrupt more easily if multiple writes happen at once. JSON is acceptable only for the first local prototype.

---

## Budget & Constraints

### Budget Breakdown

| Item | MVP Choice | Expected Monthly Cost |
|---|---|---:|
| Hosting | Small VPS | $4–$8 |
| Database | SQLite on same VPS | $0 |
| Domain | None | $0 |
| Website | None | $0 |
| Monitoring | Free uptime monitor / basic logs | $0 |
| Donation tool | Ko-fi / Patreon / Buy Me a Coffee | $0 base |
| Total | VPS-only MVP | ~$4–$8/month |

### Hard Constraints

- Maximum $10/month.
- First working MVP in 1–2 weeks.
- No website.
- No custom domain.
- No expensive external database.
- Discord-only UX.
- Beginner-friendly infrastructure.
- Build with AI assistance.

---

## Quality Standards

### What This App Will NOT Accept

- Placeholder production text such as “Lorem ipsum”.
- Half-working features.
- A setup flow that only the developer understands.
- Deleting channels that XenoVoice did not create.
- Breaking admin permissions.
- Ignoring Discord API rate limits.
- Requiring a website for MVP.
- Adding premium/paywall pressure before trust is built.

### Bot Behavior Standards

- Every error should have a friendly explanation.
- Admins should know what permission is missing.
- The bot should fail safely.
- Cleanup should never delete non-temporary channels.
- Logs should be clear enough for debugging.

---

## Safety, Abuse, and Permissions

### Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Users spam channel creation | High | Per-user cooldown, one temp channel per user |
| Too many temp channels in one category | Medium/High | Per-server max temp channel limit |
| Bot lacks permissions | High | `/setup` permission check and clear error |
| User joins/leaves too quickly | Medium | Re-check state before moving/deleting |
| Empty channel deleted too early | Medium | 5–10 second cleanup delay |
| Generator channel deleted manually | Medium | Detect missing channel and ask admin to rerun `/setup` |
| Owner leaves server | Medium | Delete if empty; later add claim ownership |
| Permission overwrites break access | High | Store default behavior and test lock/unlock carefully |
| API rate limits | Medium | Queue edits, avoid repeated retries, respect rate limit responses |
| SQLite file loss | Medium | Daily backup script |
| Donations do not cover hosting | Medium | Keep hosting cheap; avoid heavy infrastructure |

---

## Monetization

### Free-First Promise

XenoVoice should not lock the core temporary voice experience behind premium.

### Core Free Features

- Join-to-Create
- Auto-delete empty channels
- Channel ownership
- Rename
- Lock/unlock
- User limit
- Basic setup
- Discord-native panel

### Ethical Supporter Perks

| Perk | Safe for Free-First? | Notes |
|---|---|---|
| Supporter badge in support server | Yes | Cosmetic/community perk |
| Public thanks | Yes | Good for early supporters |
| Vote on roadmap | Yes | Does not block core value |
| Early beta access | Yes | Fine if stable features become free later |
| Priority support | Mostly yes | Be careful not to abandon free users |
| Custom branding | Maybe later | Could become premium without hurting core |
| Higher server limits | Maybe later | Avoid too early |

### Avoid Early

- Locking rename/limit/lock behind premium.
- Aggressive upgrade prompts.
- Paywalling basic setup.
- Making the free version feel broken.

---

## Launch Strategy

### First 30 Days

#### Phase 1 — Private Test

Goal: make sure the bot works on real servers.

- Test on 1 personal/private server.
- Test with 2–5 friendly community servers.
- Ask admins to try setup without your help.
- Track bugs manually in a simple Notion/Trello/GitHub Issues board.

#### Phase 2 — Small Beta

Goal: validate whether admins actually want this.

- Create support server.
- Add `/help`.
- Add `/support`.
- Create short demo GIF:
  - user joins Join-to-Create
  - bot creates channel
  - user opens panel
  - user renames/locks/sets limit
  - channel auto-deletes
- Invite 5–10 more servers.

#### Phase 3 — Public Listing Prep

Goal: prepare for bot directories.

- Write a clear bot description.
- Add screenshots/GIFs.
- Create basic documentation inside Discord or a README.
- Submit to bot lists only after the bot is stable.

### Feedback Collection

Use:

- Support server channel: `#bug-reports`
- Support server channel: `#feature-requests`
- Simple command: `/feedback`
- Optional form later

### Metrics to Track

| Metric | Why |
|---|---|
| Guilds installed | Measures adoption |
| Active guilds | Measures real usage |
| Temp channels created | Measures core value |
| Failed creations | Shows technical issues |
| Rename/lock/limit usage | Shows which controls matter |
| 7-day active servers | Measures retention |
| Support command usage | Measures help needs |
| Donation clicks | Measures monetization signal |

---

## 1–2 Week Build Roadmap

### Day 1 — Project Setup

- Create GitHub repo.
- Set up Node.js + TypeScript.
- Install discord.js.
- Create Discord application and bot.
- Add bot token through environment variables.
- Create basic bot login.
- Add simple health log: “XenoVoice online”.

### Day 2 — Slash Commands

Build:

- `/help`
- `/setup`
- `/panel`

Acceptance:

- Commands register successfully.
- Bot responds with embeds.
- Admin-only commands check permissions.

### Day 3 — SQLite Storage

Create tables:

- `guild_settings`
- `temp_channels`
- `metrics`

Store:

- guild ID
- generator channel ID
- category ID
- default user limit
- channel owner ID
- temp channel ID

### Day 4 — Setup Flow

Build `/setup`.

MVP version can be simple:

- create category if needed
- create Join-to-Create voice channel
- save IDs to SQLite
- show success embed

Postpone fancy dropdown setup if needed.

### Day 5 — Voice State Handler

Build core logic:

- detect when user joins generator
- create temp voice channel
- move user into it
- save owner/channel mapping

Acceptance:

- One user can create one temp channel.
- If user already has a temp channel, bot moves them there or shows error.

### Day 6 — Auto Delete

Build cleanup:

- detect when temp channel becomes empty
- wait 5–10 seconds
- re-check if still empty
- delete channel
- remove database row

Acceptance:

- No non-temp channels are deleted.
- Manual deletion does not crash bot.

### Day 7 — Owner Control Panel

Build `/panel`.

Buttons:

- Rename
- Lock
- Unlock
- Set Limit
- Refresh

Acceptance:

- Only owner/admin can use controls.
- Non-owner receives friendly error.

### Day 8 — Rename + Limit

Build:

- rename modal
- set limit modal or select menu
- validation
- success/error embeds

### Day 9 — Lock / Unlock

Build permission overwrite logic.

Acceptance:

- Lock prevents normal members from joining.
- Unlock restores access.
- Admins are not locked out.
- Bot does not remove unrelated overwrites.

### Day 10 — Error Handling

Add friendly errors for:

- missing Manage Channels
- missing Move Members
- missing permission overwrite ability
- generator channel missing
- category full or unavailable
- user left before move
- rate-limited request

### Day 11 — Metrics

Track:

- temp channels created
- creation failures
- active guild timestamp
- `/support` usage

### Day 12 — Deployment

Deploy to VPS.

Use:

- environment variables for secrets
- process manager such as PM2
- basic log files
- restart on crash

### Day 13 — Real Server Testing

Test on 2–5 servers.

Checklist:

- Invite bot
- Run `/setup`
- Create temp voice
- Rename
- Lock/unlock
- Set limit
- Leave channel
- Confirm deletion
- Restart bot
- Confirm database persists

### Day 14 — Polish

- Improve wording.
- Add `/help`.
- Add `/support`.
- Add setup troubleshooting.
- Fix beta bugs.
- Prepare demo GIF.

---

## Testing Checklist

### Core Flow

- [ ] Admin can invite bot.
- [ ] Admin can run `/setup`.
- [ ] Join-to-Create channel is created.
- [ ] User joins generator channel.
- [ ] Bot creates temporary voice channel.
- [ ] Bot moves user into channel.
- [ ] Bot stores channel owner.
- [ ] Empty channel is deleted.
- [ ] Database row is removed after deletion.

### Control Panel

- [ ] Owner can open `/panel`.
- [ ] Non-owner cannot control someone else’s channel.
- [ ] Admin can override.
- [ ] Rename works.
- [ ] Lock works.
- [ ] Unlock works.
- [ ] User limit works.

### Safety

- [ ] Bot does not delete normal voice channels.
- [ ] Bot handles missing permissions.
- [ ] Bot handles deleted generator channel.
- [ ] Bot handles deleted temp channel.
- [ ] Bot handles user leaving before move.
- [ ] Bot does not create multiple channels for one user.
- [ ] Cooldown prevents spam.

### Deployment

- [ ] Bot restarts after crash.
- [ ] Token is not committed to GitHub.
- [ ] SQLite database persists.
- [ ] Logs are accessible.
- [ ] Basic backup exists.

---

## Open Questions & Assumptions

### Assumptions

- MVP starts with one language, likely English or Russian.
- First beta servers are small-to-medium communities.
- One Join-to-Create generator is enough for MVP.
- SQLite is enough for the first test period.
- Donations are a long-term sustainability signal, not the first success metric.

### Open Questions

- Should the first UI language be Russian, English, or bilingual?
- Should default channel names be English (`{user}'s Room`) or neutral (`{user}`)?
- Should `/setup` create a new category automatically or ask first?
- Should one user be allowed to own only one temp channel at a time?
- What is the first donation platform: Ko-fi, Patreon, Buy Me a Coffee, or GitHub Sponsors?

---

## Definition of Done for MVP

The MVP is ready to launch when:

- [ ] `/setup` works end-to-end.
- [ ] Join-to-Create works reliably.
- [ ] Bot creates temporary voice channels.
- [ ] Bot moves users into created channels.
- [ ] Bot deletes empty temporary channels.
- [ ] Bot stores owner/channel mappings.
- [ ] `/panel` works for owners.
- [ ] Rename works.
- [ ] Lock/unlock works.
- [ ] User limit works.
- [ ] Basic metrics are tracked.
- [ ] Friendly error messages exist.
- [ ] Missing permission checks exist.
- [ ] Bot runs 24/7 on hosting under $10/month.
- [ ] Tested on at least 2 real Discord servers.

---

## Recommended Next Steps

1. Approve this PRD.
2. Create the Technical Design Document.
3. Choose exact tech stack:
   - Node.js
   - TypeScript
   - discord.js
   - SQLite
   - VPS hosting
4. Generate database schema.
5. Generate bot architecture.
6. Build the MVP in the order:
   - login
   - commands
   - setup
   - voice state handler
   - channel creation/deletion
   - owner controls
   - deployment
7. Test with 2–5 real servers.
8. Collect feedback before adding post-MVP features.

---

*Document created: 4 May 2026*  
*Status: Draft — Ready for Technical Design*  
*Owner: Viktoria Barsova*
