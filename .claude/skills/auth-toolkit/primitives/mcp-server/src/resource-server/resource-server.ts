import {
  createMcpHandler,
  type AuthInfo,
  type McpRequestContext,
} from '@modelcontextprotocol/server';
import {
  createMcpResourceServer,
  type TokenPrincipal,
} from 'auth-toolkit/server/mcp';
import { createToolServer } from '../tools/index.ts';

export interface ResourceServerConfig {
  /** The Auth Worker's URL, e.g. `https://auth.example.com`. */
  authWorkerUrl: string;
  /** This server's own MCP endpoint URL; the audience of every token. */
  resource: string;
  /** Scopes every Access Token must carry. */
  requiredScopes: ReadonlyArray<string>;
}

const PRINCIPAL = 'principal';

// The SDK carries caller-verified auth as an opaque AuthInfo; the Token
// Principal rides in its `extra` so the tool server can close over it.
const authInfoFor = (
  request: Request,
  principal: TokenPrincipal,
): AuthInfo => ({
  token: request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '',
  clientId: principal.client.id,
  scopes: [...principal.scopes],
  extra: { [PRINCIPAL]: principal },
});

const principalOf = (ctx: McpRequestContext): TokenPrincipal => {
  const principal = ctx.authInfo?.extra?.[PRINCIPAL] as
    | TokenPrincipal
    | undefined;
  if (!principal) {
    throw new Error('An MCP request reached the tool server unauthenticated.');
  }
  return principal;
};

const landing = (config: ResourceServerConfig) =>
  new Response(
    [
      'MCP Server',
      `Endpoint: ${config.resource}`,
      `Auth Worker: ${config.authWorkerUrl}`,
      `Required Scopes: ${config.requiredScopes.join(' ') || '(none)'}`,
      '',
      'Point an MCP client at the endpoint. It is sent to the Auth Worker to sign in first.',
    ].join('\n'),
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );

/** The whole Resource Server as one Web-standard fetch handler, so every
 * entry (Cloudflare, Node, Vercel) is a few lines around it. Only the MCP
 * endpoint and its discovery documents exist; `/` describes the server. */
export const createResourceServer = (
  config: ResourceServerConfig,
): ((request: Request) => Promise<Response>) => {
  const mcpPath = new URL(config.resource).pathname;

  // Every request is served by a fresh tool server for its Token Principal
  // and no session is kept between requests, for 2026-07-28 traffic and for
  // the 2025-era protocol today's clients (and the official client SDK)
  // still open with. That is what lets the same code run on any serverless
  // host; only 2025-style GET/DELETE session calls are refused (405).
  const mcp = createMcpHandler((ctx) => createToolServer(principalOf(ctx)), {
    legacy: 'stateless',
  });

  const protectedMcp = createMcpResourceServer({
    authWorkerUrl: config.authWorkerUrl,
    resource: config.resource,
    requiredScopes: config.requiredScopes,
    handler: (request, principal) =>
      mcp.fetch(request, { authInfo: authInfoFor(request, principal) }),
  });

  return async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/') return landing(config);
    if (pathname === mcpPath || pathname.startsWith('/.well-known/')) {
      return protectedMcp(request);
    }
    return new Response('Not found', { status: 404 });
  };
};
