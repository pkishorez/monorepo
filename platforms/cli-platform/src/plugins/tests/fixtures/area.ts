import { randomUUID } from 'node:crypto';
import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Context, Effect, Layer, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Plugin, PluginFolders } from '../../plugin/index.js';

/*
 * A Plugin with routes of its own, for the tests. `ticket` gives the token
 * for a file it writes in its data folder, which its Public Area serves at
 * `/public/<token>/clip.txt`, a Range of it too; `/hello` answers the key
 * alone. Its handler and its routes share the one Ticket its Layer makes.
 */

export const Area = RpcGroup.make(
  Rpc.make('ticket', { success: Schema.String }),
);

class Ticket extends Context.Service<
  Ticket,
  { readonly token: string; readonly file: string }
>()('test/Ticket') {}

const ticket = Layer.effect(
  Ticket,
  Effect.map(PluginFolders, ({ data }) => {
    const file = join(data, 'clip.txt');
    writeFileSync(file, '0123456789');
    return { token: randomUUID(), file };
  }),
);

/** The bytes a `bytes=<start>-<end>` Range asks of `size`, if it is one. */
const rangeOf = (header: string | undefined, size: number) => {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  if (match === null) return undefined;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return { start, end };
};

const clip = Effect.gen(function* () {
  const { token, file } = yield* Ticket;
  const params = yield* HttpRouter.params;
  if (params.token !== token) return HttpServerResponse.empty({ status: 404 });
  const request = yield* HttpServerRequest.HttpServerRequest;
  const size = statSync(file).size;
  const headers = {
    'accept-ranges': 'bytes',
    'content-security-policy': 'sandbox',
  };
  const range = rangeOf(request.headers.range, size);
  if (range === undefined)
    return yield* HttpServerResponse.file(file, {
      contentType: 'text/plain',
      headers,
    });
  return yield* HttpServerResponse.file(file, {
    status: 206,
    contentType: 'text/plain',
    offset: range.start,
    bytesToRead: range.end - range.start + 1,
    headers: {
      ...headers,
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
    },
  });
});

export const runArea = () =>
  Plugin.make({
    name: 'area',
    group: Area,
    layer: Area.toLayer(
      Effect.map(Ticket, ({ token }) => ({
        ticket: () => Effect.succeed(token),
      })),
    ).pipe(Layer.provideMerge(ticket)),
    routes: [
      HttpRouter.route('GET', '/hello', HttpServerResponse.text('hello')),
    ],
    publicRoutes: [HttpRouter.route('GET', '/:token/clip.txt', clip)],
  })();
