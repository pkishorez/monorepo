import { createServer } from 'node:http';
import { rmSync } from 'node:fs';

const socket = process.env.KE_SOCKET;
rmSync(socket, { force: true });
createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ path: request.url, headers: request.headers }));
}).listen(socket, () => process.send?.({ ready: true }));
