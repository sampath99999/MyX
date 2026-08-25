# MyX for OpenClaw

Connects [OpenClaw](https://docs.openclaw.ai) to a MyX account so it can read and
write money, tasks, notes, memories and checklists.

The bundle is two things: an MCP server entry pointing at MyX's `/api/mcp`, and a
skill that teaches the assistant the house rules (rupees not paise, `YYYY-MM-DD`,
tasks belong to spaces, confirm before anything that moves money).

## Setup

**1. Mint a key.** In MyX, go to **Settings → Connections**, name a key after the
machine it will live on, and choose whether it may write. The key is shown once —
copy it then.

**2. Put it in the environment** where the OpenClaw gateway runs:

```bash
export MYX_API_KEY=myx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**3. Install the bundle and restart the gateway:**

```bash
openclaw plugins install ./integrations/openclaw-myx
```

**4. Check it:**

```bash
openclaw mcp status myx
```

`openclaw mcp tools myx` lists what it can do.

### Without the bundle

One command does the same job if you would rather not install anything — MyX's
Settings → Connections screen prints this with the key already in it:

```bash
openclaw mcp set myx '{"url":"https://api-myx.samchitech.com/api/mcp","transport":"streamable-http","headers":{"Authorization":"Bearer YOUR_KEY_HERE"}}'
```

You lose the skill that way, so the assistant knows the tools but not the
conventions — expect it to need more correcting about dates and amounts.

## Self-hosting

`mcp.json` hardcodes the public MyX API. Point it at your own Worker if you run
one; everything else is the same.

## What a key can and cannot do

It reaches the account's **contents** — read, and write if you gave it write
scope. It cannot change the password, sign the account out, delete it, or create
more keys. Revoking a key in Settings kills it immediately.

Nothing in the tool set deletes anything.
