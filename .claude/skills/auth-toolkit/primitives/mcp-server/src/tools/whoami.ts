import type { McpServer } from '@modelcontextprotocol/server';
import type { TokenPrincipal } from 'auth-toolkit/server/mcp';

/** The proof that authorization worked: who the Access Token says is acting,
 * through which Client Application, with which Scopes. */
export const registerWhoami = (
  server: McpServer,
  principal: TokenPrincipal,
): void => {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description:
        'The User this Access Token acts for, the Client Application holding it, and the Scopes granted.',
    },
    () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              user: principal.user,
              client: principal.client,
              scopes: principal.scopes,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
};
