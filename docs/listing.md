# Pemucik Listing Copy

This file collects listing-ready copy for bot directories and lightweight submission prep. Keep it aligned with the current MVP and avoid promising post-MVP features.

## Product position

Pemucik is a Discord-only temporary voice bot for communities that want spontaneous voice rooms without clutter, premium pressure, or a web dashboard.

Core positioning points:

- free-first temporary voice rooms
- setup and control fully inside Discord
- clean server structure through safe auto-cleanup
- lightweight owner controls without extra dashboards

## Tagline options

- Temporary voice channels without the premium pressure.
- Join, talk, leave - Pemucik cleans up automatically.
- Free-first temporary voice rooms for Discord communities.

## Short description options

Use these where a bot directory asks for a compact summary.

### Chosen default

Use this as the default English short description for the first public listing pass:

`Free-first Discord bot for temporary voice channels. Run /setup once, let members join the generator voice channel, and Pemucik creates and cleans up rooms automatically.`

### English

`Free-first Discord bot for temporary voice channels. Run /setup once, let members join the generator voice channel, and Pemucik creates and cleans up rooms automatically.`

### Russian

`Бесплатный Discord-бот для временных голосовых комнат. Админ один раз запускает /setup, участники заходят в канал-генератор, а Pemucik сам создаёт и удаляет комнаты.`

## Long description

### Chosen default

Use the English long description below as the default long listing copy for the first public listing pass.

### English

Pemucik helps Discord communities keep voice chat simple. An admin runs `/setup` once, members join the generator voice channel, and Pemucik creates a temporary room for them automatically.

Room owners can manage their space directly inside Discord with `/voice ...`: rename the room, lock or unlock it, change the user limit, transfer ownership, and use related room controls. When everyone leaves, Pemucik safely removes the empty room after confirming that it is a tracked temporary channel.
Members inside an abandoned tracked room can also use `/voice claim` to take ownership when the previous owner is no longer there.

Why Pemucik:

- free-first core experience
- no website required
- Discord-native setup and controls
- safe cleanup that avoids deleting normal voice channels

Current MVP scope:

- one generator channel per server
- temporary room creation and cleanup
- ownership tracking
- rename, lock/unlock, user limit, claim, and related room controls through `/voice ...`
- `/help` and `/support` for onboarding

### Russian

Pemucik помогает Discord-серверам держать голосовые каналы в порядке. Администратор один раз запускает `/setup`, участники заходят в канал-генератор, и бот автоматически создаёт для них временную комнату.

Владелец комнаты управляет ею прямо в Discord через `/voice ...`: может переименовать комнату, закрыть или открыть её, изменить лимит участников и использовать связанные команды управления комнатой. Когда все выходят, Pemucik безопасно удаляет пустую комнату только после проверки, что она действительно отслеживается как временная.

Почему Pemucik:

- free-first подход без давления premium-ограничениями
- без сайта и веб-панели
- настройка и управление прямо в Discord
- безопасная очистка без удаления обычных голосовых каналов

Текущий MVP:

- один канал-генератор на сервер
- создание и удаление временных комнат
- привязка владельца
- переименование, lock/unlock, claim и лимит участников через `/voice ...`
- `/help` и `/support` для онбординга

## Feature bullets

Use these when a bot list allows bullet points or highlights:

- Run `/setup` once and create a Join-to-Create voice channel
- Auto-create temporary voice rooms when members join
- Let owners manage rooms with `/voice ...`
- Rename, lock, unlock, and set a user limit inside Discord
- Auto-delete empty temp rooms after a safety delay and DB confirmation

## Trust and support notes

Good wording for listing FAQs or extra fields:

- Pemucik is Discord-only and does not require a website.
- Basic functionality is meant to stay useful without a premium wall.
- Support and donation links can be shown through `/support`.

Recommended first-listing exposure policy:

- expose the public support link in listings
- do not expose the public donation link in listings yet

Why this default:

- support visibility reduces setup friction and makes early adoption easier
- hiding the donation link in the first listing keeps positioning focused on trust and utility rather than monetization
- donation can still remain available inside Discord through `/support`

Avoid promising:

- multiple generators
- temporary text channels
- multilingual configuration UI
- advanced permit/reject flows
- web dashboard features

## Asset checklist

Use this before submitting to public bot directories:

- short demo GIF showing `/setup`, join, room creation, `/voice ...`, and cleanup
- 1 screenshot of the setup result
- 1 screenshot of the owner panel
- 1 screenshot or short clip of room cleanup after everyone leaves
- support server URL
- donation URL

Repo note:

- `MEMORY.md` says a short demo GIF has already been completed, but no GIF asset is currently stored in this repository. Add the exported asset to the submission bundle before publishing.
