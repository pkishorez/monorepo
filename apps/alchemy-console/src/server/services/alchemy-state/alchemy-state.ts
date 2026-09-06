import { Effect, Schema } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { HttpApiClient } from 'effect/unstable/httpapi';
import { StateApi } from 'alchemy/State/HttpStateApi';
import {
  persistedStateView,
  StoreDetailsError,
} from '../../../shared/contracts/store-details/index.ts';
import { maskSecrets } from './mask-secrets.ts';

const invalidState = () => new StoreDetailsError({ code: 'invalid-state' });

export type StateRequest =
  | { kind: 'stacks' }
  | { kind: 'stages'; stack: string }
  | { kind: 'resources' | 'outputs'; stack: string; stage: string }
  | { kind: 'resource'; stack: string; stage: string; resource: string };

export const read = (
  connection: { url: string; authToken: string },
  request: StateRequest,
) =>
  Effect.gen(function* () {
    // Only Cloudflare's public Worker endpoints; never forward tokens to redirects or private hosts.
    const endpoint = yield* Effect.try({
      try: () => new URL(connection.url),
      catch: () => new StoreDetailsError({ code: 'unsupported-endpoint' }),
    });
    if (
      endpoint.protocol !== 'https:' ||
      !endpoint.hostname.endsWith('.workers.dev') ||
      endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      return yield* Effect.fail(
        new StoreDetailsError({ code: 'unsupported-endpoint' }),
      );
    }

    // Use Alchemy's HTTP contract directly: remote payloads are untrusted until decoded below.
    const client = yield* HttpApiClient.make(StateApi, {
      baseUrl: connection.url,
      transformClient: HttpClient.mapRequest((request) =>
        request.pipe(HttpClientRequest.bearerToken(connection.authToken)),
      ),
    });
    const api = client.state;
    const json = (value: unknown) =>
      Schema.decodeUnknownEffect(Schema.Json)(
        maskSecrets(value ?? null, connection.authToken),
      ).pipe(Effect.mapError(invalidState));
    switch (request.kind) {
      case 'stacks':
        return [...(yield* api.listStacks())].sort();
      case 'stages':
        return [
          ...(yield* api.listStages({ params: { stack: request.stack } })),
        ].sort();
      case 'resources':
        return [
          ...(yield* api.listResources({
            params: { stack: request.stack, stage: request.stage },
          })),
        ].sort();
      case 'outputs':
        return yield* json(
          yield* api.getStackOutput({
            params: { stack: request.stack, stage: request.stage },
          }),
        );
      case 'resource': {
        const raw: unknown = yield* api.getState({
          params: {
            stack: request.stack,
            stage: request.stage,
            // Alchemy decodes fqn again after its HTTP router decodes the path.
            fqn: encodeURIComponent(request.resource),
          },
        });
        if (raw == null) return null;
        const state = yield* Schema.decodeUnknownEffect(persistedStateView)(
          maskSecrets(raw, connection.authToken),
        ).pipe(Effect.mapError(invalidState));
        if (state.fqn !== request.resource)
          return yield* Effect.fail(invalidState());
        return state;
      }
    }
  }).pipe(
    Effect.catch((error) =>
      Effect.fail(
        error instanceof StoreDetailsError
          ? error
          : new StoreDetailsError({ code: 'remote-error' }),
      ),
    ),
    Effect.timeout('60 seconds'),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(new StoreDetailsError({ code: 'timeout' })),
    ),
    Effect.withSpan(`AlchemyState.${request.kind}`),
  );
