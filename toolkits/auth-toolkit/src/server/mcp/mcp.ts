import { createMcpProtectedRequestHandler } from '@better-auth/mcp';
import {
  accessTokenIdentity,
  authWorkerIssuer,
  authWorkerJwksUrl,
} from '../auth-worker/index.js';
import type { TokenPrincipal } from '../current-auth/index.js';
import {
  isProtectedResourceMetadataPath,
  protectedResourceMetadataResponse,
} from './protected-resource-metadata.js';

export type { TokenPrincipal };

interface McpResourceServerOptions {
  /** The Auth Worker's deployed URL, e.g. `https://auth.example.com`. */
  authWorkerUrl: string;
  /** This MCP Server's URL, e.g. `https://mcp.example.com/mcp`; must be listed
   * in the Auth Worker's `authorizationServer.resources`. */
  resource: string;
  requiredScopes?: ReadonlyArray<string> | undefined;
  handler: (
    request: Request,
    principal: TokenPrincipal,
  ) => Response | Promise<Response>;
}

export const createMcpResourceServer = (
  options: McpResourceServerOptions,
): ((request: Request) => Promise<Response>) => {
  const issuer = authWorkerIssuer(options.authWorkerUrl);
  const requiredScopes = options.requiredScopes ?? [];

  const protectedHandler = createMcpProtectedRequestHandler(
    {
      issuer,
      audience: options.resource,
      jwksUrl: authWorkerJwksUrl(options.authWorkerUrl),
      ...(requiredScopes.length > 0
        ? { requiredScopes: [...requiredScopes] }
        : {}),
    },
    (request, claims) =>
      options.handler(request, {
        kind: 'token',
        ...accessTokenIdentity(claims),
      }),
  );

  return async (request) => {
    const { pathname } = new URL(request.url);
    if (!isProtectedResourceMetadataPath(pathname, options.resource)) {
      return protectedHandler(request);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'mcp-protocol-version',
        },
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    return protectedResourceMetadataResponse({
      resource: options.resource,
      issuer,
      scopes: requiredScopes,
    });
  };
};
