import type { ComponentType, ReactNode } from 'react';
import type { Effect, Layer } from 'effect';
import type { AnyActor } from '../../core/index.ts';
import type { ViewOf } from '../../react/index.ts';
import type {
  Inputs,
  Metadata,
  Place,
  PlaceSchema,
  Codec,
} from '../../routing/route/index.ts';
import type { LoadError } from '../../routing/route/index.ts';

/** What Start needs of the app the Router serves: what `Router.app(Routes, App)` gives. */
export interface ServedApp {
  readonly actor: AnyActor;
  readonly view: ViewOf<any>;
  readonly startAt: (
    url?: string,
    inputs?: Inputs,
  ) => { readonly route: any; readonly inputs?: Inputs } | undefined;
  readonly href: (route: any) => string;
  readonly routes: {
    readonly route: Codec<any>;
    readonly path: (route: any) => string;
    readonly metadata: (of: any, inputs?: Inputs) => Metadata;
    readonly places: (of: any) => ReadonlyArray<Place>;
    readonly every: ReadonlyArray<PlaceSchema>;
  };
}

/** One place's Loader, as `Routes.loaders` types it. */
export type AnyLoader = (
  params: never,
  request: Request,
) => Effect.Effect<unknown, LoadError, any>;

/** The Layer the Loaders need: one, or one made for each request from the Worker's env. */
export type ServerLayer =
  | Layer.Layer<any, any, never>
  | ((env: any) => Layer.Layer<any, any, never>);

export type DocumentType = ComponentType<{ readonly children: ReactNode }>;
