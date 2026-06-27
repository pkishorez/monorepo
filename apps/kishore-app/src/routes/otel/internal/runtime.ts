import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpApiClient } from 'effect/unstable/httpapi';
import { LotelApi } from '@kishorez/lotel/client';

type Client = Effect.Success<ReturnType<typeof makeClientEffect>>;

const makeClientEffect = (baseUrl: string) =>
  HttpApiClient.make(LotelApi, { baseUrl });

export class LotelClient extends Context.Service<LotelClient, Client>()(
  'otel-route/LotelClient',
) {}

export const makeLotelClientLayer = (baseUrl: string) =>
  Layer.effect(LotelClient, makeClientEffect(baseUrl)).pipe(
    Layer.provide(FetchHttpClient.layer),
  );

export type LotelRuntime = ManagedRuntime.ManagedRuntime<LotelClient, never>;

export const makeLotelRuntime = (baseUrl: string): LotelRuntime =>
  ManagedRuntime.make(makeLotelClientLayer(baseUrl));
