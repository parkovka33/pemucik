# XenoVoice Troubleshooting

Use this page for the most common MVP setup and runtime issues.

## `/setup` says the bot is missing permissions

XenoVoice checks for required permissions before creating channels.

Check that the bot has:

- `Manage Channels`
- `Move Members`
- `View Channels`
- `Connect`
- `Send Messages`

For quick beta testing, granting `Administrator` is the simplest fix.

If you recently changed `/setup` defaults:

- confirm the selected `category` still exists
- confirm the chosen `permission` source matches the behavior you expect for new temp rooms
- rerun `/setup` if the previous category or generator was deleted manually

## Joining the generator channel does nothing

Check these points:

1. `/setup` was run successfully in this server.
2. The member joined the configured generator voice channel, not a normal voice room.
3. The bot is online and connected.
4. The user is not currently blocked by the create cooldown.
5. The user does not already own a tracked temporary room.

## The bot created a room but did not move the member

This usually means the bot lacks `Move Members` or the target voice state changed during creation.

Check:

- bot role position and permissions
- whether Discord returned a `Missing Permissions` error
- whether the member switched channels during the operation

## `/voice ...` says there is no tracked temporary room

Room-control commands inside `/voice ...` only work for:

- the owner of the tracked temp room
- an admin with `Manage Channels` or `Administrator`
- a member who is inside the tracked temp room and can legitimately use `/voice claim`

Also check that:

- you are currently inside the temp room, or
- the room still exists and is tracked in SQLite `temp_channels`

## `/voice claim` says ownership cannot be taken

`/voice claim` is intentionally conservative.

The command only works when:

- you are currently inside the tracked temp room
- the room is still present in SQLite `temp_channels`
- the current owner is no longer inside that same room

If claim is denied:

- check that you are in the tracked temp room
- check that the previous owner has really left that room
- check that the room is still the tracked XenoVoice temp room

## Lock or unlock fails with `Missing Permissions`

XenoVoice changes only the relevant channel overwrite instead of wiping all overwrites. That is safer, but it still requires the bot to have permission to edit channel overwrites.

Check:

- the bot has enough Discord permissions
- the bot role is high enough in the server
- the channel/category permissions are not blocking overwrite edits

## Temporary rooms are not deleted

Cleanup is intentionally conservative.

XenoVoice will only delete a room when:

1. the room is empty
2. the cleanup delay has passed
3. the room still exists after a second check
4. the room is present in SQLite `temp_channels`

If a room stays around:

- verify it is actually empty
- check logs for cleanup errors
- confirm the DB row exists and is removed after successful cleanup

## The bot deleted the wrong room

That should be treated as a critical bug.

Immediate checks:

1. stop the bot
2. preserve logs
3. inspect the `temp_channels` table
4. open a bug report with the guild ID, channel ID, and the exact sequence of actions

The intended safety rule is that XenoVoice never deletes a room unless it is confirmed in `temp_channels`.

## Slash commands are missing

Re-register commands:

```bash
npm run commands:register
```

If you use `DISCORD_GUILD_ID`, commands should appear faster in that guild. Global command propagation can take longer.

## `/interface` did not appear or looks stale

Check these points:

1. `/setup` has already been run successfully in this server.
2. The configured setup category still exists.
3. Re-run `/interface` after changing `/setup` category defaults or deleting the old interface channel.
4. If the interface message was deleted manually, rerunning `/interface` should recreate or refresh it.

## Where to ask for help

- Runtime help inside Discord: `/support`
- Repository issues and docs problems: [GitHub Issues](../issues)
