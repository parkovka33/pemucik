# FAQ

## What is Pemucik?

Pemucik is a Discord-only bot that creates temporary voice channels on demand. An admin runs `/setup`, members join the generator voice channel, and Pemucik creates and later cleans up temporary rooms automatically.

## Does Pemucik need a website?

No. The MVP is intentionally Discord-only. Setup and owner controls happen through slash commands and Discord components.

## Which commands are available right now?

- `/setup`
- `/panel`
- `/rename`
- `/lock`
- `/unlock`
- `/limit`
- `/claim`
- `/help`
- `/support`

## What can room owners do?

Inside a tracked temporary room, the owner can:

- rename the room
- lock or unlock it
- change the user limit

If the owner is gone, a member still inside that tracked room can use `/claim` to take ownership, as long as the old owner is no longer in the room.

Admins can override owner controls if they have `Manage Channels` or `Administrator`.

## How many generator channels does the MVP support?

One generator channel per server.

## What languages are supported?

The current Discord-facing copy is Russian-first. The broader multilingual plan exists in the product docs, but it is not part of the current MVP surface yet.

## How do I get started?

Start with:

- [README.md](../README.md)
- [docs/quickstart.md](../docs/quickstart.md)
- [docs/troubleshooting.md](../docs/troubleshooting.md)

## Where do I report bugs or request changes?

Use GitHub Issues and pick the relevant template.

## How do I report a security issue?

Do not post secrets, tokens, or `.env` contents publicly. Follow [SECURITY.md](SECURITY.md).
