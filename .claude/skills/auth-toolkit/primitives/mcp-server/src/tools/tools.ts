import { McpServer } from '@modelcontextprotocol/server';
import type { TokenPrincipal } from 'auth-toolkit/server/mcp';
import { registerEcho } from './echo.ts';
import { registerWhoami } from './whoami.ts';

/** The MCP surface for one Token Principal. A fresh server is built per
 * request, so a tool can close over its User and nothing leaks between
 * Users. Register new tools here, one file each. */
export const createToolServer = (principal: TokenPrincipal): McpServer => {
  const server = new McpServer({ name: '__APP_NAME__', version: '0.0.0' });
  registerWhoami(server, principal);
  registerEcho(server);
  return server;
};
