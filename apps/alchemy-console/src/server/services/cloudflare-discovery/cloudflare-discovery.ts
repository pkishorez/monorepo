import { Effect, Schema } from 'effect';
import { HttpClientRequest } from 'effect/unstable/http';
import {
  apiResult,
  failure,
  nonEmpty,
  readJson,
  describeFailure,
  send,
} from './http.ts';
export { CloudflareDiscoveryError } from './http.ts';

type CloudflareAccount = { accountId: string; apiToken: string };
const previewSession = Schema.Struct({
  token: nonEmpty,
  exchange_url: Schema.optional(Schema.NullOr(Schema.String)),
});

export const discover = Effect.fn('CloudflareDiscovery.discover')(
  function* (account: CloudflareAccount) {
    const secrets = new Set([account.apiToken, account.apiToken.trim()]);
    const base = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}`;
    const request = (path: string) =>
      HttpClientRequest.get(`${base}${path}`).pipe(
        HttpClientRequest.bearerToken(account.apiToken),
      );
    const read = <A>(path: string, schema: Schema.Codec<A>) =>
      readJson(apiResult(schema), request(path), secrets).pipe(
        Effect.map((body) => body.result),
      );

    yield* describeFailure(
      'Validating Cloudflare credentials',
      /^[a-f0-9]{32}$/i.test(account.accountId) && account.apiToken.trim()
        ? Effect.void
        : Effect.fail(
            failure(
              'Provide a 32-character Cloudflare account ID and a non-empty API token.',
            ),
          ),
    );

    const { subdomain } = yield* describeFailure(
      'Reading the Workers subdomain',
      read('/workers/subdomain', Schema.Struct({ subdomain: nonEmpty })).pipe(
        Effect.filterOrFail(
          ({ subdomain }) => /^[a-z0-9-]+$/i.test(subdomain),
          () => failure('Cloudflare returned an invalid Workers subdomain.'),
        ),
      ),
    );
    const url = `https://alchemy-state-store.${subdomain}.workers.dev`;
    yield* describeFailure(
      'Finding the alchemy-state-store Worker',
      send(request('/workers/scripts/alchemy-state-store/settings'), secrets),
    );
    const store = yield* describeFailure(
      'Finding the Cloudflare Secrets Store',
      read(
        '/secrets_store/stores',
        Schema.Array(Schema.Struct({ id: nonEmpty })),
      ).pipe(
        Effect.flatMap((stores) =>
          stores[0]
            ? Effect.succeed(stores[0])
            : Effect.fail(
                failure(
                  'No Secrets Store exists in this account. Set up Alchemy state storage first.',
                  'state-store-missing',
                ),
              ),
        ),
      ),
    );

    const session = yield* describeFailure(
      'Creating a Workers preview session',
      read('/workers/subdomain/edge-preview', previewSession),
    );
    secrets.add(session.token);
    const uploadToken = yield* describeFailure(
      'Exchanging the Workers preview session',
      exchangePreviewToken(session, secrets),
    );
    const {
      result: { preview_token: previewToken },
    } = yield* describeFailure(
      'Binding AlchemyStateStoreToken to the preview Worker',
      readJson(
        apiResult(Schema.Struct({ preview_token: nonEmpty })),
        HttpClientRequest.post(
          `${base}/workers/scripts/alchemy-state-store/edge-preview`,
        ).pipe(
          HttpClientRequest.bearerToken(account.apiToken),
          HttpClientRequest.setHeader(
            'cf-preview-upload-config-token',
            uploadToken,
          ),
          HttpClientRequest.bodyFormData(secretProbe(store.id)),
        ),
        secrets,
      ),
    );
    secrets.add(previewToken);

    const authToken = yield* describeFailure(
      'Reading AlchemyStateStoreToken from the preview Worker',
      send(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeader('cf-workers-preview-token', previewToken),
        ),
        secrets,
      ).pipe(
        Effect.flatMap((response) =>
          response.text.pipe(
            Effect.mapError(() =>
              failure('Could not read the preview response. Please retry.'),
            ),
          ),
        ),
        Effect.map((text) => text.trim()),
        Effect.filterOrFail(
          (token) => token.length > 0,
          () =>
            failure(
              'The AlchemyStateStoreToken secret is empty or missing. Check the Alchemy state-store setup.',
              'state-store-missing',
            ),
        ),
      ),
    );
    secrets.add(authToken);
    yield* describeFailure(
      'Verifying access to Alchemy state',
      readJson(
        Schema.Array(Schema.String),
        HttpClientRequest.get(`${url}/state/stacks`).pipe(
          HttpClientRequest.bearerToken(authToken),
        ),
        secrets,
      ),
    );
    yield* Effect.logInfo('Resolved state store connection');
    return { url, authToken };
  },
  Effect.timeout('45 seconds'),
  Effect.catchTag('TimeoutError', () =>
    Effect.fail(failure('Discovery exceeded 45 seconds. Please retry.')),
  ),
);

const exchangePreviewToken = Effect.fn(function* (
  session: typeof previewSession.Type,
  secrets: Set<string>,
) {
  if (!session.exchange_url) return session.token;

  const exchange = yield* Effect.try({
    try: () => new URL(session.exchange_url!),
    catch: () =>
      failure('Cloudflare returned an invalid preview exchange URL.'),
  });
  secrets.add(exchange.href);
  for (const value of exchange.searchParams.values()) secrets.add(value);

  const trustedHost = [
    '.cloudflare.com',
    '.cloudflareworkers.com',
    '.workers.dev',
  ].some((suffix) => exchange.hostname.endsWith(suffix));
  if (
    exchange.protocol !== 'https:' ||
    exchange.username ||
    exchange.password ||
    !trustedHost
  )
    return yield* Effect.fail(
      failure(
        'Cloudflare returned a preview exchange URL outside the allowed HTTPS Cloudflare domains.',
      ),
    );

  // Alchemy uses the initial token when this optional exchange is unavailable.
  const exchanged = yield* readJson(
    Schema.Struct({ token: nonEmpty }),
    HttpClientRequest.get(exchange.href),
    secrets,
  ).pipe(
    Effect.timeout('30 seconds'),
    Effect.catch(() => Effect.succeed({ token: session.token })),
  );
  secrets.add(exchanged.token);
  return exchanged.token;
});

const source = `export default {
  async fetch(request, env) {
    return new Response(await env.SECRET.get(), {
      headers: { 'content-type': 'text/plain' },
    });
  },
};`;

function secretProbe(storeId: string) {
  const form = new FormData();
  form.set(
    'metadata',
    JSON.stringify({
      main_module: 'probe.js',
      compatibility_date: '2025-04-28',
      bindings: [
        {
          type: 'secrets_store_secret',
          name: 'SECRET',
          secret_name: 'AlchemyStateStoreToken',
          store_id: storeId,
        },
      ],
    }),
  );
  form.set(
    'wrangler-session-config',
    JSON.stringify({ workers_dev: true, minimal_mode: true }),
  );
  form.set(
    'probe.js',
    new File([source], 'probe.js', { type: 'application/javascript+module' }),
  );
  return form;
}
