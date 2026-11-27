import { McpProtocol, McpServer } from 'effect/ai';

export const MCP_PATH = '/mcp';

const INSTRUCTIONS =
  'DevTools for local development: each Tool of DevTools offers its tools here, named for it, and each says where to start.';

export function makeMcpLive({
  version,
  ownOrigins,
}: {
  readonly version: string;
  readonly ownOrigins: ReadonlyArray<string>;
}) {
  return McpServer.layerHttp({
    name: 'devtools',
    version,
    instructions: INSTRUCTIONS,
    path: MCP_PATH,
    protocols: [
      McpProtocol.v2025_11_25,
      McpProtocol.v2025_06_18,
      McpProtocol.v2025_03_26,
    ],
    allowedOrigins: ownOrigins,
    allowSessionTermination: true,
  });
}
