# Pemucik VPS Migration

This guide is for moving Pemucik to a new VPS without losing the current bot state.

## Important safety note

As of the current repository checkout, `origin` is `https://github.com/parkovka33/pemucik.git`. Confirm its visibility before pushing, and never push `.env`, SQLite backups, or other runtime data to any remote.

Use one of these options instead:

1. Create a new **private** GitHub repository for the migration.
2. Or change the current repository visibility to **private** in GitHub before pushing anything sensitive.

## What you must preserve

- the git repository with the bot code
- the SQLite database at `data/pemucik.sqlite`, or the legacy pre-rebrand `data/xenovoice.sqlite` used by an existing installation
- the Discord/runtime secrets stored in `.env`

## 1. Prepare the old VPS

Recommended: stop the running bot first so the migration snapshot is easy to reason about.

If you use PM2, stop it with your real process name, for example:

```bash
pm2 stop pemucik
```

Then build the repo and create a consistent SQLite backup:

```bash
npm install
npm run build
node dist/scripts/createMigrationBackup.js
```

That command creates a timestamped folder inside `backups/`, for example:

```text
backups/migration-2026-05-07T12-34-56Z/
```

Inside it you will get:

- `pemucik.sqlite`
- `metadata.json`
- `RESTORE-NOTES.txt`
- `.env.example`

`.env` is intentionally not copied into the backup. Preserve it separately and securely.

## 2. Push the code to a private GitHub repo over HTTPS

Because SSH is not configured, use HTTPS with a GitHub Personal Access Token (PAT).

First create a new private repository in GitHub, for example `pemucik-private-backup`.

Then add it as a new remote:

```bash
git remote add private https://github.com/<your-user>/<your-private-repo>.git
```

If you have local changes that are not committed yet, snapshot them before pushing:

```bash
git status
git add .
git commit -m "Snapshot before VPS migration"
```

Then push:

```bash
git push -u private main
```

When Git asks for credentials:

- username: your GitHub username
- password: your GitHub PAT, not your normal GitHub password

The PAT needs repository write access to that private repo. A fine-grained token scoped to that repository is enough.

## 3. Download or copy the runtime data

Before the old VPS expires, keep these two items outside GitHub as well:

1. the backup database from `backups/migration-.../pemucik.sqlite`
2. the current `.env`

If you want a belt-and-suspenders backup, download both files to your local machine before switching hosts.

## 4. Set up the new VPS

Install the required system packages and Node.js 20+.

Example for Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git curl build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Clone the private repo:

```bash
git clone https://github.com/<your-user>/<your-private-repo>.git
cd <your-private-repo>
```

Restore the environment file:

```bash
cp .env.example .env
```

Then edit `.env` and put back your real values from the old VPS:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` if you use guild-scoped registration
- `DATABASE_PATH` if you changed it from the default
- optional support/donation URLs

Restore the SQLite data:

```bash
mkdir -p data
cp /path/to/pemucik.sqlite data/pemucik.sqlite
```

If your old `.env` used a custom `DATABASE_PATH`, restore the file into that exact path instead. If it relied on the legacy `data/xenovoice.sqlite` default, restore that filename unchanged; Pemucik detects it automatically when `DATABASE_PATH` is unset and no new-name database exists.

## 5. Install and start the bot on the new VPS

Run the standard project commands in this order:

```bash
npm install
npm run db:migrate
npm run build
npm run commands:register
npm start
```

## 6. Optional PM2 start

If you want the bot supervised again with PM2:

```bash
sudo npm install -g pm2
pm2 start npm --name pemucik-bot -- start
pm2 save
```

## 7. Post-migration checks

Run these checks after startup:

1. confirm the bot logs in successfully
2. run `/setup` only if the server was not already configured
3. join the generator voice channel
4. confirm a temp room is created
5. confirm existing behavior still matches the restored database state
6. leave the room and confirm cleanup still works

For the broader verification loop, use [agent_docs/testing.md](../agent_docs/testing.md).
