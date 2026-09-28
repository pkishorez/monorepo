import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const roundsFolder = resolve(import.meta.dirname, 'rounds');

// Saves a Pick as PICK.md in its Round folder. Claude applies Picks whose
// status is still `picked`, then marks them `applied`.
export function pickServer(): Plugin {
  return {
    name: 'pick-server',
    configureServer(server) {
      server.middlewares.use('/__pick', (request, response) => {
        let body = '';
        request.on('data', (chunk) => (body += chunk));
        request.on('end', () => {
          const { round, question, pick, rejected, reason } = JSON.parse(body);
          const folder = join(roundsFolder, String(round));
          if (!/^[\w-]+$/.test(round) || !existsSync(folder)) {
            response.statusCode = 404;
            response.end();
            return;
          }
          writeFileSync(
            join(folder, 'PICK.md'),
            `---\nstatus: picked\n---\n\n# ${question}\n\n**Picked:** ${pick}\n\n**Rejected:** ${rejected.join(', ')}\n\n**Why:** ${reason}\n`,
          );
          response.end('{}');
        });
      });
    },
  };
}
