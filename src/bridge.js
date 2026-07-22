import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_INSTALLER_URL =
  'https://cdn.aidenote.cn/tunnel/releases/3.2.6/install-macos.sh';
const DEFAULT_WINDOWS_INSTALLER_URL =
  'https://cdn.aidenote.cn/tunnel/releases/3.2.6/install-windows.ps1';
const DEFAULT_INSTALLER_SHA256 =
  '5afb27d2640b73689217775989253c0cdea05c4f35ea0ee9f86bb4c0551070cd';
const DEFAULT_WINDOWS_INSTALLER_SHA256 =
  '5a5a3ecee34e3dce6d2248744bcac854296ed0f4c3afab0f3a344c9f36d908f6';
const DEFAULT_TUNNEL_BASE_URL =
  'https://cdn.aidenote.cn/tunnel/releases/3.2.6';
const MAC_LABEL = 'cn.aidenote.openclaw-tunnel';
const MAC_WORKBUDDY_BRIDGE_LABEL = 'cn.aidenote.workbuddy-bridge';
const WINDOWS_TASK_NAME = 'AideNoteOpenClawBridge';
const WINDOWS_WORKBUDDY_BRIDGE_TASK_NAME = 'AideNoteWorkBuddyBridge';

export function registerBridgeTools(api) {
  function getConfig() {
    const config = api.getConfig();
    if (!config?.apiKey) {
      throw new Error(
        '未配置 AideNote API Key。请运行: openclaw config set slonaide.apiKey YOUR_API_KEY'
      );
    }
    return config;
  }

  api.registerTool({
    name: 'slonaide_setup_remote_bridge',
    description:
      '安装并启动 AideNote OpenClaw 远程对话 bridge，让手机 App 可以连接本机 OpenClaw',
    parameters: {
      type: 'object',
      properties: {
        reinstall: {
          type: 'boolean',
          description: '是否重新安装 bridge',
          default: false
        }
      }
    },
    async execute(_toolCallId, params) {
      try {
        if (!isSupportedPlatform()) {
          return textResult('当前自动安装支持 macOS 和 Windows。Linux 后续需要单独的服务安装脚本。');
        }

        const status = await bridgeStatus();
        if (status.running && !params?.reinstall) {
          return textResult(
            'AideNote OpenClaw bridge 已经在运行。\n' +
              status.output.trim() +
              '\n\n手机 App 里点机器人图标即可进入远程对话。'
          );
        }

        const config = getConfig();
        const installerUrl = process.platform === 'win32'
          ? config.bridgeWindowsInstallerUrl || DEFAULT_WINDOWS_INSTALLER_URL
          : config.bridgeInstallerUrl || DEFAULT_INSTALLER_URL;
        const installer = await downloadInstaller(
          installerUrl,
          process.platform === 'win32' ? 'install-windows.ps1' : 'install-macos.sh',
          process.platform === 'win32'
            ? config.bridgeWindowsInstallerSha256 || DEFAULT_WINDOWS_INSTALLER_SHA256
            : config.bridgeInstallerSha256 || DEFAULT_INSTALLER_SHA256
        );
        const env = bridgeInstallerEnv({
          AIDE_NOTE_API_KEY: config.apiKey,
          AIDE_NOTE_RELAY_HOST: config.bridgeRelayHost || 'api.aidenote.cn',
          AIDE_NOTE_TUNNEL_BASE_URL:
            config.bridgeTunnelBaseUrl || DEFAULT_TUNNEL_BASE_URL,
          OPENCLAW_LOCAL_PORT: String(config.openClawLocalPort || 18789),
          AIDE_NOTE_RESET_DEVICE_ID: params?.reinstall ? '1' : ''
        });

        const output = await run(
          process.platform === 'win32' ? 'powershell.exe' : 'bash',
          process.platform === 'win32'
            ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer]
            : [installer],
          { env, timeout: 600000 }
        );
        return textResult(
          'AideNote OpenClaw bridge 安装完成。\n\n' +
            summarizeOutput(output) +
            `\n\n以后 ${process.platform === 'win32' ? 'Windows' : 'Mac'} 登录后 bridge 会自动启动，手机 App 可直接连接。`
        );
      } catch (error) {
        return textResult(`AideNote OpenClaw bridge 安装失败: ${error.message}`);
      }
    }
  });

  api.registerTool({
    name: 'slonaide_bridge_status',
    description: '检查 AideNote OpenClaw 远程对话 bridge 是否已安装并运行',
    parameters: { type: 'object', properties: {} },
    async execute() {
      try {
        if (!isSupportedPlatform()) {
          return textResult('当前 bridge 状态检查支持 macOS 和 Windows。');
        }
        const status = await bridgeStatus();
        return textResult(
          status.running
            ? `AideNote OpenClaw bridge 正在运行。\n${status.output.trim()}`
            : `AideNote OpenClaw bridge 未运行。\n${status.output.trim()}`
        );
      } catch (error) {
        return textResult(`检查 bridge 状态失败: ${error.message}`);
      }
    }
  });
}

function isSupportedPlatform() {
  return process.platform === 'darwin' || process.platform === 'win32';
}

async function downloadInstaller(url, fileName, expectedSha256) {
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error('安装脚本缺少有效 SHA-256 校验值，已拒绝执行');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载安装脚本失败: HTTP ${response.status}`);
  }
  let script = await response.text();
  const actualSha256 = createHash('sha256').update(script, 'utf8').digest('hex');
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `安装脚本 SHA-256 校验失败，已拒绝执行。期望 ${expectedSha256}，实际 ${actualSha256}`
    );
  }
  script = script.replace(/\r\n/g, '\n');
  if (process.platform === 'win32') {
    const replacements = new Map([
      ['-RunLevel LeastPrivilege', '-RunLevel Limited'],
      [' -DisallowStartIfOnBatteries:$false', ''],
      [
        '$ActualSha256 = (Get-FileHash -Path $StagedFile -Algorithm SHA256).Hash.ToLowerInvariant()',
        [
          '$Sha256 = [System.Security.Cryptography.SHA256]::Create()',
          '    try {',
          '      $ActualSha256 = ([System.BitConverter]::ToString($Sha256.ComputeHash([System.IO.File]::ReadAllBytes($StagedFile)))).Replace("-", "").ToLowerInvariant()',
          '    } finally {',
          '      $Sha256.Dispose()',
          '    }'
        ].join('\n')
      ],
      [
        'Write-Host "Status: Get-ScheduledTask -TaskName $TaskName"\nWrite-Host "WorkBuddy bridge status: Get-ScheduledTask -TaskName $WorkBuddyBridgeTaskName"',
        'Write-Host "Autostart: $AutostartMode"'
      ]
    ]);
    for (const [source, replacement] of replacements) {
      if (script.split(source).length !== 2) {
        throw new Error('已校验的 Windows 安装脚本结构异常，已拒绝执行');
      }
      script = script.replace(source, replacement);
    }
    const scheduledTaskBlock = [
      'Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null',
      'Register-ScheduledTask -TaskName $WorkBuddyBridgeTaskName -Action $WorkBuddyBridgeAction -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null',
      'Start-ScheduledTask -TaskName $TaskName',
      'Start-ScheduledTask -TaskName $WorkBuddyBridgeTaskName'
    ].join('\n');
    const startupFallbackBlock = [
      '$AutostartMode = "Scheduled Tasks"',
      'try {',
      '  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null',
      '  Register-ScheduledTask -TaskName $WorkBuddyBridgeTaskName -Action $WorkBuddyBridgeAction -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null',
      '  Start-ScheduledTask -TaskName $TaskName',
      '  Start-ScheduledTask -TaskName $WorkBuddyBridgeTaskName',
      '} catch {',
      '  Write-Host "Scheduled Task registration unavailable; using the current user Startup folder."',
      '  foreach ($ExistingTaskName in @($TaskName, $WorkBuddyBridgeTaskName)) {',
      '    Unregister-ScheduledTask -TaskName $ExistingTaskName -Confirm:$false -ErrorAction SilentlyContinue',
      '  }',
      '  $StartupDir = [Environment]::GetFolderPath("Startup")',
      '  $TunnelStartupFile = Join-Path $StartupDir "AideNoteOpenClawBridge.cmd"',
      '  $WorkBuddyStartupFile = Join-Path $StartupDir "AideNoteWorkBuddyBridge.cmd"',
      "  $TunnelStartupCommand = '@echo off' + [Environment]::NewLine + 'start \"\" /min \"' + $TargetBinary + '\" -config \"' + $ConfigFile + '\"' + [Environment]::NewLine",
      "  $WorkBuddyStartupCommand = '@echo off' + [Environment]::NewLine + 'start \"\" /min \"' + $TargetWorkBuddyBridgeBinary + '\" -config \"' + $ConfigFile + '\"' + [Environment]::NewLine",
      '  [System.IO.File]::WriteAllText($TunnelStartupFile, $TunnelStartupCommand, $Utf8NoBom)',
      '  [System.IO.File]::WriteAllText($WorkBuddyStartupFile, $WorkBuddyStartupCommand, $Utf8NoBom)',
      "  Start-Process -FilePath $TargetBinary -ArgumentList @('-config', ('\"' + $ConfigFile + '\"')) -WindowStyle Hidden",
      "  Start-Process -FilePath $TargetWorkBuddyBridgeBinary -ArgumentList @('-config', ('\"' + $ConfigFile + '\"')) -WindowStyle Hidden",
      '  $AutostartMode = "Startup folder"',
      '}'
    ].join('\n');
    if (script.split(scheduledTaskBlock).length !== 2) {
      throw new Error('已校验的 Windows 安装脚本启动任务结构异常，已拒绝执行');
    }
    script = script.replace(scheduledTaskBlock, startupFallbackBlock);
    const portProbeAnchor = '$HermesToken = ""';
    const portProbeBlock = [
      'function Test-PortBindable {',
      '  param([int]$Port)',
      '  $Listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)',
      '  try { $Listener.Start(); return $true } catch { return $false } finally { try { $Listener.Stop() } catch {} }',
      '}',
      'if (-not (Test-PortBindable -Port $WorkBuddyBridgePort)) {',
      '  if ($env:WORKBUDDY_BRIDGE_LOCAL_PORT) { throw "Configured WorkBuddy bridge port $WorkBuddyBridgePort is unavailable." }',
      '  $FallbackPort = 0',
      '  foreach ($CandidatePort in 55415..55999) {',
      '    if (Test-PortBindable -Port $CandidatePort) { $FallbackPort = $CandidatePort; break }',
      '  }',
      '  if (-not $FallbackPort) { throw "Could not find an available WorkBuddy bridge port." }',
      '  Write-Host "WorkBuddy bridge port $WorkBuddyBridgePort is unavailable; using $FallbackPort."',
      '  $WorkBuddyBridgePort = $FallbackPort',
      '}',
      '',
      portProbeAnchor
    ].join('\n');
    if (script.split(portProbeAnchor).length !== 2) {
      throw new Error('已校验的 Windows 安装脚本端口配置结构异常，已拒绝执行');
    }
    script = script.replace(portProbeAnchor, portProbeBlock);
  }
  const dir = await mkdtemp(join(tmpdir(), 'aidenote-openclaw-'));
  const file = join(dir, fileName);
  await writeFile(file, script, { mode: 0o700 });
  return file;
}

function bridgeInstallerEnv(extraEnv) {
  const env = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    USER: process.env.USER || '',
    TMPDIR: process.env.TMPDIR || ''
  };

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const appData = process.env.APPDATA || '';
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    env.PATH = [
      localAppData && join(localAppData, 'hermes', 'hermes-agent', 'venv', 'Scripts'),
      localAppData && join(localAppData, 'hermes', 'bin'),
      appData && join(appData, 'npm'),
      env.PATH
    ].filter(Boolean).join(';');
    Object.assign(env, {
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      TEMP: process.env.TEMP || '',
      TMP: process.env.TMP || '',
      ComSpec: process.env.ComSpec || '',
      LOCALAPPDATA: localAppData,
      APPDATA: appData,
      USERPROFILE: process.env.USERPROFILE || '',
      PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE || '',
      PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
      PSModulePath:
        process.env.PSModulePath ||
        process.env.PSMODULEPATH ||
        join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
      ProgramFiles: process.env.ProgramFiles || '',
      ProgramData: process.env.ProgramData || ''
    });
  }

  return Object.fromEntries(
    Object.entries({ ...env, ...extraEnv }).filter(([, value]) => value !== '')
  );
}

async function bridgeStatus() {
  if (process.platform === 'win32') {
    const script =
      `$task = Get-ScheduledTask -TaskName '${WINDOWS_TASK_NAME}' -ErrorAction SilentlyContinue; ` +
      `$bridgeTask = Get-ScheduledTask -TaskName '${WINDOWS_WORKBUDDY_BRIDGE_TASK_NAME}' -ErrorAction SilentlyContinue; ` +
      `$proc = Get-Process aide-note-tunnel -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      `$bridgeProc = Get-Process aidenote-workbuddy-bridge -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      `if ($task) { $task | Format-List TaskName,State | Out-String } else { 'Task not found' }; ` +
      `if ($bridgeTask) { $bridgeTask | Format-List TaskName,State | Out-String } else { 'WorkBuddy bridge task not found' }; ` +
      `if ($proc) { $proc | Format-List Id,ProcessName | Out-String } else { 'Tunnel process not running' }; ` +
      `if ($bridgeProc) { $bridgeProc | Format-List Id,ProcessName | Out-String } else { 'WorkBuddy bridge process not running' }`;
    const output = await run('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 10000,
      rejectOnExit: false
    });
    const running =
      /ProcessName\s*:\s*aide-note-tunnel/i.test(output) &&
      /ProcessName\s*:\s*aidenote-workbuddy-bridge/i.test(output);
    return { running, output };
  }

  const tunnelOutput = await run('launchctl', ['print', `gui/${process.getuid()}/${MAC_LABEL}`], {
    timeout: 10000,
    rejectOnExit: false
  });
  const bridgeOutput = await run(
    'launchctl',
    ['print', `gui/${process.getuid()}/${MAC_WORKBUDDY_BRIDGE_LABEL}`],
    { timeout: 10000, rejectOnExit: false }
  );
  const output = `${tunnelOutput}\n${bridgeOutput}`;
  const running =
    /state = running|pid = \d+/.test(tunnelOutput) &&
    /state = running|pid = \d+/.test(bridgeOutput);
  return { running, output };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n');
      if (error && options.rejectOnExit !== false) {
        reject(new Error(output.trim() || error.message));
        return;
      }
      resolve(output || error?.message || '');
    });
    child.stdin?.end();
  });
}

function summarizeOutput(output) {
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-12).join('\n');
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}
