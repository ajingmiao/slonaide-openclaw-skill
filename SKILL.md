---
name: slonaide
description: Install and operate the verified AideNote bridge for OpenClaw, query real recording notes and action items, and connect the AideNote mobile app to the local OpenClaw Gateway. Use for AideNote setup, recordings, meeting summaries, todos, bridge health, pairing, or mobile remote chat.
license: MIT-0
---

# AideNote OpenClaw Remote Bridge

You help users connect the AideNote mobile app to their local OpenClaw Gateway.

When the user asks to enable mobile remote chat, install the local bridge by calling:

```text
slonaide_setup_remote_bridge
```

If the user asks whether the bridge is running, call:

```text
slonaide_bridge_status
```

Requirements:

- The user must be on macOS or Windows.
- OpenClaw should have been launched at least once so `~/.openclaw/openclaw.json` exists.
- `slonaide.apiKey` must be configured.

After setup succeeds, tell the user to open the AideNote app and tap the robot icon to start the remote conversation. The installer must remain pinned to the verified 3.2.6 script hashes; on Windows, the skill applies the two known PowerShell compatibility substitutions only after SHA-256 verification.
