import { FetchHttpClient, HttpApiClient } from '@effect/platform';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { LotelApi } from 'lotel/client';

type Client = Effect.Effect.Success<ReturnType<typeof makeClientEffect>>;

const makeClientEffect = (baseUrl: string) =>
  HttpApiClient.make(LotelApi, { baseUrl });

export class LotelClient extends Context.Tag('otel-route/LotelClient')<
  LotelClient,
  Client
>() {}

export const makeLotelClientLayer = (baseUrl: string) =>
  Layer.effect(LotelClient, makeClientEffect(baseUrl)).pipe(
    Layer.provide(FetchHttpClient.layer),
  );

export type LotelRuntime = ManagedRuntime.ManagedRuntime<LotelClient, never>;

export const makeLotelRuntime = (baseUrl: string): LotelRuntime =>
  ManagedRuntime.make(makeLotelClientLayer(baseUrl));
