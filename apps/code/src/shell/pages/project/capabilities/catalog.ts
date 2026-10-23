import { Context } from 'effect';
import type { Effect, Stream } from 'effect';
import type { Model } from '../catalog/index.ts';

/*
 * The project's catalog, the agents, their models and Skills, as the
 * project page Provides it to the pages under it.
 */

/** The catalog as its keeper shares it with the pages under it. */
export class SharedCatalog extends Context.Service<
  SharedCatalog,
  {
    /** The catalog now, then each change. */
    readonly changes: Stream.Stream<typeof Model.Type>;
    /** Reads again what could not be read. */
    readonly retry: Effect.Effect<void>;
  }
>()('code/Catalog') {}
