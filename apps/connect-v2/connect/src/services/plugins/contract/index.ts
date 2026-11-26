import { Context, Data, type Effect, type Scope } from 'effect';
import type { Release } from '@kestack/connect-v2-cloud/heartbeat';
import type { PluginFolders } from '../../../http/plugin/contract/index.js';

export interface PluginRun {
  readonly name: string;
  readonly release: Release;
  readonly folders: PluginFolders;
  readonly socket: string;
  readonly logFile: string;
}

export interface Exit {
  readonly code: number | null;
  readonly log: ReadonlyArray<string>;
}

export interface Started {
  readonly exited: Effect.Effect<Exit>;
}

export class PluginStartFailed extends Data.TaggedError('PluginStartFailed')<{
  readonly message: string;
  readonly log: ReadonlyArray<string>;
}> {}

export class Plugins extends Context.Service<
  Plugins,
  {
    readonly start: (
      run: PluginRun,
    ) => Effect.Effect<Started, PluginStartFailed, Scope.Scope>;
  }
>()('Connect/service/Plugins') {}
