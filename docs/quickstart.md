# Pemucik Quickstart

This quickstart is for a server admin who wants the shortest path from clone to a working Join-to-Create setup.

## 1. Prepare the bot

1. Create a Discord application and bot in the Discord Developer Portal.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID` for development-only command registration
4. Keep `DATABASE_PATH` as-is unless you need a custom location. Existing pre-rebrand installs that relied on the old default filename are detected automatically when this variable is unset.

## 2. Install and start locally

Run the project commands in this order:

```bash
npm install
npm run db:migrate
npm run commands:register
npm run dev
```

## 3. Invite the bot with the right permissions

Pemucik needs these permissions for the MVP:

- `Manage Channels`
- `Move Members`
- `View Channels`
- `Connect`
- `Send Messages`
- `Use Application Commands`

For early testing, `Administrator` is the simplest setup because it avoids permission edge cases during `/setup` and room-control actions.

## 4. Run setup in Discord

1. Join your test server as an admin.
2. Run `/setup` with at least `editable`.
3. Optionally set:
   - `category`, if temp rooms should be created outside the default Pemucik category
   - `permission`, if temp rooms should clone Join-to-Create overwrites instead of inheriting category permissions
4. Confirm that Pemucik creates or reuses:
   - the `Pemucik` category
   - the `➕ Войти, чтобы создать` generator voice channel

## 5. Verify the core loop

1. Join the generator voice channel.
2. Confirm that Pemucik creates a temporary voice room.
3. Confirm that you are moved into the new room.
4. Run `/voice rename` while connected to the room.
5. Check `/voice lock`, `/voice unlock`, `/voice limit`, and `/voice claim`.
6. If you use `/interface`, run it once and confirm the persistent control channel appears and responds privately.
7. Leave the room and wait for cleanup.
8. Confirm that the empty temporary room disappears.

## 6. Use the built-in helper commands

- `/help` - setup and troubleshooting guidance
- `/support` - support and donation links
- `/voice ...` - owner/admin room controls
- `/interface` - persistent in-server control surface for room actions
- `/voice claim` - let someone inside an abandoned temp room take ownership if the old owner is no longer there

## 7. Before you call setup done

Run the basic repo checks:

```bash
npm run lint
npm run build
```

Then use the manual Discord verification loop in [agent_docs/testing.md](../agent_docs/testing.md).
