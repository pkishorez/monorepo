import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

/** A tool with input, so the template shows the argument path end to end. */
export const registerEcho = (server: McpServer): void => {
  server.registerTool(
    'echo',
    {
      title: 'Echo',
      description: 'Returns the message it was given.',
      inputSchema: z.object({
        message: z.string().describe('What to echo back'),
      }),
    },
    ({ message }) => ({
      content: [{ type: 'text', text: message }],
    }),
  );
};
