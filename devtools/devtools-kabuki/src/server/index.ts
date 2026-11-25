import { Layer } from 'effect';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { accept, dial } from './http/connect/real/index.ts';
import type { TabOptions } from './http/connect/real/index.ts';
import { answered } from './rpc/session/real/index.ts';
import { sessionsRoutes } from './rpc/sessions/real/index.ts';
import type { SessionsOptions } from './rpc/sessions/real/index.ts';
import { registryLayer } from './services/registry/real/index.ts';

export type KabukiRoutesOptions = SessionsOptions;

export type { TabOptions };

export const kabukiRoutes = (options: KabukiRoutesOptions) =>
  Layer.mergeAll(accept, sessionsRoutes(options, answered)).pipe(
    Layer.provide(registryLayer),
  );

export const tab = (app: AppRuntime, options: TabOptions) =>
  dial(app, options).pipe(Layer.provide(answered));
