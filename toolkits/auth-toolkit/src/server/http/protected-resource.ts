import { Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

const WELL_KNOWN = '/.well-known/oauth-protected-resource' as const;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'mcp-protocol-version',
};

const resourcePath = (resource: string) =>
  new URL(resource).pathname.replace(/\/$/, '');

/** Where an OAuth Client reads this Resource Server's Protected Resource
 * Metadata (RFC 9728), named in every challenge. */
const metadataUrl = (resource: string) =>
  `${new URL(resource).origin}${WELL_KNOWN}${resourcePath(resource)}`;

/** Serves the Protected Resource Metadata at both RFC 9728 paths, readable
 * from any origin. */
export const protectedResourceMetadata = (options: {
  readonly resource: string;
  readonly issuer: string;
  readonly scopes: ReadonlyArray<string>;
}) => {
  const document = {
    resource: options.resource,
    authorization_servers: [options.issuer],
    bearer_methods_supported: ['header'],
    ...(options.scopes.length > 0 && {
      scopes_supported: [...options.scopes],
    }),
  };
  const route = (path: `/${string}`) =>
    Layer.merge(
      HttpRouter.add(
        'GET',
        path,
        HttpServerResponse.jsonUnsafe(document, {
          headers: { ...CORS, 'cache-control': 'public, max-age=300' },
        }),
      ),
      HttpRouter.add(
        'OPTIONS',
        path,
        HttpServerResponse.empty({ status: 204, headers: CORS }),
      ),
    );
  const path = resourcePath(options.resource);
  return path === ''
    ? route(WELL_KNOWN)
    : Layer.merge(route(WELL_KNOWN), route(`${WELL_KNOWN}${path}`));
};

/** `response` with the `WWW-Authenticate` challenge an OAuth Client follows
 * when it is a 401 (sign in) or a 403 (ask for more Scopes). */
export const withChallenge = (
  response: HttpServerResponse.HttpServerResponse,
  resource: string,
  scopes: ReadonlyArray<string> | undefined,
): HttpServerResponse.HttpServerResponse => {
  if (response.status !== 401 && response.status !== 403) return response;
  const parts = [
    ...(response.status === 403 ? ['error="insufficient_scope"'] : []),
    ...(scopes !== undefined && scopes.length > 0
      ? [`scope="${scopes.join(' ')}"`]
      : []),
    `resource_metadata="${metadataUrl(resource)}"`,
  ];
  return HttpServerResponse.setHeader(
    response,
    'www-authenticate',
    `Bearer ${parts.join(', ')}`,
  );
};
