import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { HelloApi } from './contract.ts';

/*
 * The HTTP Worker as the browser calls it: one Effect per level of access,
 * each the Worker's greeting or why it was refused. Its URL is the site's
 * `VITE_HELLO_HTTP_URL`, which Alchemy sets and Vite inlines. Calls go with
 * the session cookie and the Account they expect, which auth-toolkit's
 * `browser` Layer adds; the Layer here requires it.
 */

const url = import.meta.env.VITE_HELLO_HTTP_URL;

const make = Effect.map(
  HttpApiClient.make(HelloApi, { baseUrl: url }),
  (client) => ({
    public: client.greetings.public(),
    authenticated: client.greetings.authenticated(),
    authorized: client.greetings.authorized(),
  }),
);

export class HelloHttp extends Context.Service<
  HelloHttp,
  Effect.Success<typeof make>
>()('kabuki-start/HelloHttp') {
  /** Where the Worker is: what the client calls. */
  static readonly url = url;
  static readonly layer = Layer.effect(HelloHttp, make).pipe(
    Layer.provide(FetchHttpClient.layer),
  );
}
