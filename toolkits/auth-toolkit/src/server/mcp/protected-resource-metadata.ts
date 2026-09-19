const WELL_KNOWN = '/.well-known/oauth-protected-resource';

export const isProtectedResourceMetadataPath = (
  pathname: string,
  resource: string,
): boolean => {
  const resourcePath = new URL(resource).pathname.replace(/\/$/, '');
  return pathname === WELL_KNOWN || pathname === `${WELL_KNOWN}${resourcePath}`;
};

interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: [string];
  bearer_methods_supported: ['header'];
  scopes_supported?: string[];
}

export const protectedResourceMetadataResponse = (options: {
  resource: string;
  issuer: string;
  scopes: ReadonlyArray<string>;
}): Response => {
  const metadata: ProtectedResourceMetadata = {
    resource: options.resource,
    authorization_servers: [options.issuer],
    bearer_methods_supported: ['header'],
    ...(options.scopes.length > 0
      ? { scopes_supported: [...options.scopes] }
      : {}),
  };
  return Response.json(metadata, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'mcp-protocol-version',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
