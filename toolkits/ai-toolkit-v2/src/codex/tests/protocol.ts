import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const protocolFile = join(
  import.meta.dirname,
  '..',
  'contract',
  'protocol.gen.ts',
);

const responses: Readonly<Record<string, string>> = {
  'memory/reset': 'MemoryResetResponse',
  'rollout/compress': 'RolloutCompressResponse',
  'account/gatewayOAuth/read': 'GatewayOAuthReadResponse',
  'account/gatewayOAuth/login': 'GatewayOAuthLoginResponse',
  'account/gatewayOAuth/cancel': 'GatewayOAuthCancelResponse',
  'remoteControl/enable': 'RemoteControlEnableResponse',
  'remoteControl/disable': 'RemoteControlDisableResponse',
  'remoteControl/status/read': 'RemoteControlStatusReadResponse',
  'config/mcpServer/reload': 'McpServerRefreshResponse',
  'windowsSandbox/readiness': 'WindowsSandboxReadinessResponse',
  'account/logout': 'LogoutAccountResponse',
  'account/rateLimits/read': 'GetAccountRateLimitsResponse',
  'account/usage/read': 'GetAccountTokenUsageResponse',
  'account/workspaceMessages/read': 'GetWorkspaceMessagesResponse',
  'externalAgentConfig/import/readHistories':
    'ExternalAgentConfigImportHistoriesReadResponse',
  'config/value/write': 'ConfigWriteResponse',
  'config/batchWrite': 'ConfigWriteResponse',
  'configRequirements/read': 'ConfigRequirementsReadResponse',
};

const files = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
    .map((name) => ({
      name: name.slice(0, -3),
      text: readFileSync(join(dir, name), 'utf8'),
    }));

const body = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.startsWith('import ') && !line.startsWith('// '))
    .join('\n')
    .trim();

const methods = (text: string) =>
  [
    ...text.matchAll(
      /"method": "([^"]+)", id: RequestId, params\??: ([^,]+), \}/g,
    ),
  ].map(([, method, params]) => ({ method: method!, params: params! }));

export const generate = (codex = 'codex') => {
  const out = mkdtempSync(join(tmpdir(), 'codex-protocol-'));
  try {
    execFileSync(codex, [
      'app-server',
      'generate-ts',
      '--experimental',
      '--out',
      out,
    ]);
    const version = execFileSync(codex, ['--version'], {
      encoding: 'utf8',
    }).trim();
    const root = files(out);
    const v2 = files(join(out, 'v2'));
    const json = files(join(out, 'serde_json'));
    const names = new Set([...v2, ...json].map((file) => file.name));
    const clashes = root
      .map((file) => file.name)
      .filter((name) => names.has(name));
    const v1 = root.map((file) => {
      let text = body(file.text);
      for (const name of clashes)
        if (file.name === name || file.text.includes(`from "./${name}"`))
          text = text.replaceAll(new RegExp(`\\b${name}\\b`, 'g'), `V1${name}`);
      return text;
    });
    const all = new Set([...root, ...v2, ...json].map((file) => file.name));
    const result = (method: string, params: string) => {
      const name =
        responses[method] ??
        params.split(' ')[0]!.replace(/Params$/, 'Response');
      if (!all.has(name)) throw new Error(`No response type for ${method}`);
      return name;
    };
    const map = (name: string, text: string) =>
      [
        `export type ${name} = {`,
        ...methods(text).map(
          ({ method, params }) =>
            `  readonly '${method}': { readonly params: ${params}; readonly result: ${result(method, params)} };`,
        ),
        '};',
      ].join('\n');
    const read = (name: string) =>
      readFileSync(join(out, `${name}.ts`), 'utf8');
    return [
      `// Generated from ${version} by src/codex/tests/protocol.ts. Do not edit.`,
      ...v1,
      ...v2.map((file) => body(file.text)),
      ...json.map((file) => body(file.text)),
      map('ClientRequests', read('ClientRequest')),
      map('ServerRequests', read('ServerRequest')),
      '',
    ].join('\n\n');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
};

if (process.argv[1] === import.meta.filename)
  writeFileSync(protocolFile, generate());
