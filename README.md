# AideNote OpenClaw Bridge Skill

This skill adds local bridge setup tools to the AideNote OpenClaw skill.

## Tools

- `slonaide_setup_remote_bridge`: installs the verified AideNote 3.2.6 connection suite on macOS or Windows and registers login auto-start.
- `slonaide_bridge_status`: checks whether the tunnel and WorkBuddy bridge are running.

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
5. The mobile App can open the robot chat and connect to this computer automatically.

## Publishing Notes

Publish these release assets before enabling the installer for public users:

- `install-macos.sh`
- `install-windows.ps1`
- `aide-note-tunnel_darwin_arm64`
- `aide-note-tunnel_darwin_amd64`
- `aide-note-tunnel_windows_amd64.exe`
- `aide-note-tunnel_windows_arm64.exe`

The default installer URL is:

```text
https://cdn.aidenote.cn/tunnel/releases/3.2.6/install-macos.sh
```

Override it with:

```bash
openclaw config set slonaide.bridgeInstallerUrl "https://cdn.aidenote.cn/tunnel/releases/3.2.6/install-macos.sh"
openclaw config set slonaide.bridgeWindowsInstallerUrl "https://cdn.aidenote.cn/tunnel/releases/3.2.6/install-windows.ps1"
openclaw config set slonaide.bridgeTunnelBaseUrl "https://cdn.aidenote.cn/tunnel/releases/3.2.6"
```
