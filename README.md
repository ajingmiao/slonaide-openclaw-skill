# AideNote OpenClaw Bridge Skill

This skill adds local bridge setup tools to the AideNote OpenClaw skill.

## Tools

- `slonaide_setup_remote_bridge`: installs `aide-note-tunnel` on macOS, writes `~/.aidenote/openclaw-tunnel.json`, registers the launchd agent, and starts the bridge.
- `slonaide_bridge_status`: checks whether the launchd bridge is running.

## User Flow

1. Install the skill from ClawHub.
2. Configure the AideNote API Key:

```bash
openclaw config set slonaide.apiKey "sk-your-api-key"
```

3. Ask OpenClaw:

```text
帮我安装 AiDeNote OpenClaw 远程 bridge
```

4. OpenClaw calls `slonaide_setup_remote_bridge`.
5. The mobile App can open the robot chat and connect to this Mac automatically.

## Publishing Notes

Publish these release assets before enabling the installer for public users:

- `install-macos.sh`
- `aide-note-tunnel_darwin_arm64`
- `aide-note-tunnel_darwin_amd64`

The default installer URL is:

```text
https://cdn.aidenote.cn/tunnel/releases/3.2.2/install-macos.sh
```

Override it with:

```bash
openclaw config set slonaide.bridgeInstallerUrl "https://cdn.aidenote.cn/tunnel/releases/3.2.2/install-macos.sh"
openclaw config set slonaide.bridgeTunnelBaseUrl "https://cdn.aidenote.cn/tunnel/releases/3.2.2"
```
