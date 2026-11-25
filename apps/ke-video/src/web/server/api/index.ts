import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { follow, run } from './cli.server.ts';
import { sendFile } from './files.server.ts';

/*
 * The web app's `/api/*`, a Vite plugin whose middleware runs before Kabuki
 * Start's. It touches files and processes through two doors only: the CLI
 * (`cli.server.ts`), and the files a Video's `files` names, as `status`
 * answers them (`files.server.ts`). A CLI error is its one line as
 * `{ error }`, with a status that says what kind it was. There is no
 * sign-in, so a change asked from another site's page is refused.
 *
 *   GET    /api/videos                  list
 *   POST   /api/videos                  create, from `{ url, strength }`
 *   GET    /api/videos/:id              status
 *   DELETE /api/videos/:id              delete
 *   POST   /api/videos/:id/stop         stop
 *   POST   /api/videos/:id/resume       resume
 *   GET    /api/videos/:id/logs         logs -f, streamed as NDJSON
 *   GET    /api/videos/:id/file/:name   video, original, transcriptJson, summaryJson or cuts
 */

const FILES = ['video', 'original', 'transcriptJson', 'summaryJson', 'cuts'];
const STRENGTHS = ['light', 'normal', 'heavy'];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

type Response = ServerResponse<IncomingMessage>;

const json = (response: Response, status: number, body: unknown) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
};

/** How a CLI error's line reads: refused for the Video's state, no such Video, broken, or a bad ask. */
const statusOf = (error: string) =>
  /already (exists|running)|not running|nothing to resume|is done/i.test(error)
    ? 409
    : /^no video|not found|no such/i.test(error)
      ? 404
      : /^could not run|printed no JSON|exited with/i.test(error)
        ? 500
        : 400;

const answer = async (response: Response, args: ReadonlyArray<string>) => {
  const result = await run(args);
  if (result.ok) json(response, 200, result.json);
  else json(response, statusOf(result.error), { error: result.error });
};

const bodyOf = async (request: IncomingMessage): Promise<unknown> => {
  let text = '';
  for await (const chunk of request) text += chunk;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const create = async (request: IncomingMessage, response: Response) => {
  const body = await bodyOf(request);
  const { url, strength = 'normal' } = (body ?? {}) as {
    url?: unknown;
    strength?: unknown;
  };
  if (typeof url !== 'string' || url.trim() === '')
    return json(response, 400, { error: 'Paste a YouTube link first.' });
  if (typeof strength !== 'string' || !STRENGTHS.includes(strength))
    return json(response, 400, {
      error: 'Strength is light, normal or heavy.',
    });
  await answer(response, ['create', url.trim(), '--strength', strength]);
};

/** `logs <id> -f --json`, line by line as it prints, until it ends or the browser goes. */
const logs = (response: Response, id: string) => {
  const child = follow(['logs', id, '-f']);
  let stderr = '';
  let streaming = false;
  child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  child.stdout?.once('data', () => {
    streaming = true;
    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
  });
  child.stdout?.on('data', (chunk) => response.write(chunk));
  child.once('error', (error) =>
    json(response, 500, { error: `Could not run ke-video: ${error.message}` }),
  );
  child.once('close', (code) => {
    if (streaming) return response.end();
    if (code === 0) return json(response, 200, []);
    const error =
      stderr.trim().split('\n').at(-1)?.trim() ||
      `ke-video exited with ${code}`;
    json(response, statusOf(error), { error });
  });
  response.once('close', () => {
    if (child.exitCode === null) child.kill();
  });
};

const file = async (
  request: IncomingMessage,
  response: Response,
  id: string,
  name: string,
) => {
  if (!FILES.includes(name))
    return json(response, 404, { error: `No file called ${name}.` });
  const status = await run(['status', id]);
  if (!status.ok)
    return json(response, statusOf(status.error), { error: status.error });
  const path = (status.json as { files?: Record<string, unknown> }).files?.[
    name
  ];
  if (typeof path !== 'string' || !(await sendFile(request, response, path)))
    json(response, 404, { error: `${id} has no ${name} yet.` });
};

/** Whether a browser sent it from this app's own pages: one that is not says where from. */
const fromHere = (request: IncomingMessage) => {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
};

const route = async (request: IncomingMessage, response: Response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    !fromHere(request)
  )
    return json(response, 403, { error: 'Refused: asked from another site.' });
  const parts = pathname.split('/').filter(Boolean).slice(1);
  const method = request.method ?? 'GET';
  const [videos, id, action, name, ...rest] = parts;
  if (videos !== 'videos' || rest.length > 0 || (id && !ID.test(id)))
    return json(response, 404, { error: `Nothing at ${pathname}.` });
  if (id === undefined) {
    if (method === 'GET') return answer(response, ['list']);
    if (method === 'POST') return create(request, response);
  } else if (action === undefined) {
    if (method === 'GET') return answer(response, ['status', id]);
    if (method === 'DELETE') return answer(response, ['delete', id]);
  } else if (action === 'stop' || action === 'resume') {
    if (method === 'POST' && name === undefined)
      return answer(response, [action, id]);
  } else if (action === 'logs' && name === undefined) {
    if (method === 'GET') return logs(response, id);
  } else if (action === 'file' && name !== undefined) {
    if (method === 'GET' || method === 'HEAD')
      return file(request, response, id, name);
  } else return json(response, 404, { error: `Nothing at ${pathname}.` });
  json(response, 405, { error: `${method} is not allowed at ${pathname}.` });
};

/** The `/api/*` routes, under `vite dev`. */
export const api = (): Plugin => ({
  name: 'ke-video:api',
  configureServer: (server) => {
    server.middlewares.use('/api', (request, response) => {
      // Mounted at `/api`, connect hands the rest of the path; put it back.
      request.url = `/api${request.url ?? ''}`;
      route(request, response).catch((error: unknown) => {
        if (response.headersSent) return response.destroy();
        json(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  },
});
