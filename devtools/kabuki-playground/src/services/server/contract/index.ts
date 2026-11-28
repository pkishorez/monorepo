import { Context, Schema } from 'effect';
import type { Effect } from 'effect';

export class ServerDown extends Schema.TaggedError<ServerDown>()('ServerDown', {
  reason: Schema.String,
}) {}

export class Server extends Context.Service<Server, ServerService>()(
  'Playground/service/Server',
) {}

export interface Stored {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}
export interface ServerService {
  readonly load: Effect.Effect<ReadonlyArray<Stored>, ServerDown>;
  readonly save: (id: string, title: string) => Effect.Effect<void, ServerDown>;
  readonly mark: (id: string, done: boolean) => Effect.Effect<void, ServerDown>;
}
