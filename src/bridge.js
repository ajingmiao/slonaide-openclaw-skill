import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_INSTALLER_URL =
  'https://cdn.aidenote.cn/tunnel/releases/3.2.0/install-macos.sh';
const DEFAULT_INSTALLER_SHA256 =
  'c5f019f6ba563d23aaca8f8818e2e7f4e8262ddd71b5570ea7a1d2fc5ab0adea';
const LABEL = 'cn.aidenote.openclaw-tunnel';

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
        if (process.platform !== 'darwin') {
          return textResult('当前自动安装只支持 macOS。Windows/Linux 后续需要单独的服务安装脚本。');
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
        const installerUrl = config.bridgeInstallerUrl || DEFAULT_INSTALLER_URL;
        const installer = await downloadInstaller(
          installerUrl,
          config.bridgeInstallerSha256 || DEFAULT_INSTALLER_SHA256
        );
        const env = bridgeInstallerEnv({
          AIDE_NOTE_API_KEY: config.apiKey,
          AIDE_NOTE_RELAY_HOST: config.bridgeRelayHost || 'api.aidenote.cn',
          AIDE_NOTE_TUNNEL_BASE_URL:
            config.bridgeTunnelBaseUrl || 'https://cdn.aidenote.cn/tunnel/releases/3.2.0',
          AIDE_NOTE_TOKEN_ENDPOINT:
            config.tokenEndpoint ||
            `${config.baseUrl || 'https://api.aidenote.cn'}/api/UserapikeyMstr/GetToken/{apiKey}`,
          OPENCLAW_LOCAL_PORT: String(config.openClawLocalPort || 18789),
          AIDE_NOTE_RESET_DEVICE_ID: params?.reinstall ? '1' : ''
        });

        const output = await run('bash', [installer], { env, timeout: 120000 });
        return textResult(
          'AideNote OpenClaw bridge 安装完成。\n\n' +
            summarizeOutput(output) +
            '\n\n以后 Mac 登录后 bridge 会自动启动，手机 App 可直接连接。'
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
        if (process.platform !== 'darwin') {
          return textResult('当前 bridge 状态检查只支持 macOS。');
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

async function downloadInstaller(url, expectedSha256) {
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error('安装脚本缺少有效 SHA-256 校验值，已拒绝执行');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载安装脚本失败: HTTP ${response.status}`);
  }
  const script = await response.text();
  const actualSha256 = createHash('sha256').update(script, 'utf8').digest('hex');
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `安装脚本 SHA-256 校验失败，已拒绝执行。期望 ${expectedSha256}，实际 ${actualSha256}`
    );
  }
  const dir = await mkdtemp(join(tmpdir(), 'aidenote-openclaw-'));
  const file = join(dir, 'install-macos.sh');
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

  return Object.fromEntries(
    Object.entries({ ...env, ...extraEnv }).filter(([, value]) => value !== '')
  );
}

async function bridgeStatus() {
  const output = await run('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`], {
    timeout: 10000,
    rejectOnExit: false
  });
  const running = /state = running|pid = \d+/.test(output);
  return { running, output };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n');
      if (error && options.rejectOnExit !== false) {
        reject(new Error(output.trim() || error.message));
        return;
      }
      resolve(output || error?.message || '');
    });
  });
}

function summarizeOutput(output) {
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-12).join('\n');
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}
