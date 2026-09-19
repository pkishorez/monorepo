// Two instances: production and local. Everything else derives from the hosts.

export const productionHost = '__PRODUCTION_HOST__';
export const localHost = '__LOCAL_HOST__';

/** The Auth Worker each instance trusts. Local talks to local auth only. */
export const authProductionHost = '__AUTH_PRODUCTION_HOST__';
export const authLocalHost = '__AUTH_LOCAL_HOST__';

/** Where the MCP endpoint answers. The Resource identifier every Access
 * Token is bound to is `https://<host><mcpPath>`, verbatim. */
export const mcpPath = '/mcp';

/** The Scopes every Access Token must carry. The Auth Worker lists the same
 * names in `authorizationServer.scopes`, with the consent-page wording. */
export const requiredScopes: ReadonlyArray<string> = ['__SCOPE__'];

export const isProdStage = (stage: string): boolean => stage === 'prod';

export const hostsFor = (stage: string): { host: string; authHost: string } =>
  isProdStage(stage)
    ? { host: productionHost, authHost: authProductionHost }
    : { host: localHost, authHost: authLocalHost };

/** What the Resource Server needs to know about itself and its Auth Worker. */
export const resourceServerConfigFor = (hosts: {
  host: string;
  authHost: string;
}): { authWorkerUrl: string; resource: string } => ({
  authWorkerUrl: `https://${hosts.authHost}`,
  resource: `https://${hosts.host}${mcpPath}`,
});
