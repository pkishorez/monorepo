import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { Rpc, RpcClient, RpcGroup } from 'effect/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { client, server } from './index.ts';

class Greeting extends Context.Service<Greeting, string>()('test/Greeting') {}

const Api = RpcGroup.make(
  Rpc.make('Hello', {
    payload: { name: Schema.String },
    success: Schema.String,
  }),
  Rpc.make('Count', {
    payload: { to: Schema.Number },
    success: Schema.Number,
    stream: true,
  }),
);

const Handlers = Api.toLayer({
  Hello: ({ name }) =>
    Effect.map(Greeting, (greeting) => `${greeting} ${name}`),
  Count: ({ to }) => Stream.range(1, to),
});

afterEach(() => vi.unstubAllGlobals());

/** Routes the client's `fetch` to `answer`, recording what it was sent. */
const serveFetch = (answer: (request: Request) => Promise<Response>) => {
  const sent: Request[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    sent.push(request.clone());
    return answer(request);
  });
  return sent;
};

describe('Rpc.http', () => {
  it('calls the server through the client, a stream included', async () => {
    const answer = server(Api, Handlers, {
      services: (request) =>
        Layer.succeed(Greeting, request.headers.get('x-greeting')!),
    });
    const sent = serveFetch(answer);

    const result = await Effect.gen(function* () {
      const api = yield* RpcClient.make(Api);
      const hello = yield* api.Hello({ name: 'Ada' });
      const counted = yield* Stream.runCollect(api.Count({ to: 3 }));
      return { hello, counted: Array.from(counted) };
    }).pipe(
      Effect.scoped,
      Effect.provide(
        client(Api, {
          url: 'https://api.test/rpc',
          credentials: 'omit',
          headers: { 'x-greeting': 'Hi' },
        }),
      ),
      Effect.runPromise,
    );

    expect(result).toEqual({ hello: 'Hi Ada', counted: [1, 2, 3] });
    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.headers.get('x-greeting')).toBe('Hi');
    expect(sent[0]?.credentials).toBe('omit');
  });

  it('refuses anything but a POST', async () => {
    const answer = server(
      Api,
      Handlers.pipe(Layer.provide(Layer.succeed(Greeting, 'Hi'))),
    );
    const response = await answer(new Request('https://api.test/rpc'));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('lets the caller wrap how every request is answered', async () => {
    const answer = server(
      Api,
      Handlers.pipe(Layer.provide(Layer.succeed(Greeting, 'Hi'))),
      {
        wrap: (app) =>
          Effect.map(app, (response) =>
            HttpServerResponse.setHeader(response, 'x-wrapped', 'yes'),
          ),
      },
    );
    const response = await answer(
      new Request('https://api.test/rpc', {
        method: 'POST',
        body:
          JSON.stringify({
            _tag: 'Request',
            id: '1',
            tag: 'Hello',
            payload: { name: 'Ada' },
            headers: [],
          }) + '\n',
      }),
    );

    expect(response.headers.get('x-wrapped')).toBe('yes');
    expect(await response.text()).toContain('Hi Ada');
  });
});
