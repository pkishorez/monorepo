import { Effect, Schema } from 'effect';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Toc } from '../model/index.js';

/** Error raised when `vtest/toc.ts` is missing or malformed. */
export class TocError extends Error {
  readonly _tag = 'TocError';
  readonly reason: unknown;
  constructor(message: string, reason?: unknown) {
    super(message);
    this.reason = reason;
  }
}

const decodeToc = Schema.decodeUnknownEffect(Toc);

const importToc = (tocPath: string): Effect.Effect<unknown, TocError> =>
  Effect.tryPromise({
    try: () => import(pathToFileURL(tocPath).href),
    catch: (reason) => new TocError(`failed to import ${tocPath}`, reason),
  });

/**
 * Load and validate a package's typed `vtest/toc.ts`. The module must export
 * a `toc` (or default) value shaped like {@link Toc}.
 */
export const loadToc = (packageRoot: string): Effect.Effect<Toc, TocError> =>
  Effect.gen(function* () {
    const tocPath = path.join(packageRoot, 'vtest', 'toc.ts');
    const mod = (yield* importToc(tocPath)) as {
      toc?: unknown;
      default?: unknown;
    };
    const value = mod.toc ?? mod.default;
    if (value === undefined) {
      return yield* Effect.fail(
        new TocError(`${tocPath} does not export 'toc' or a default`),
      );
    }
    return yield* decodeToc(value).pipe(
      Effect.mapError(
        (reason) => new TocError(`invalid toc shape in ${tocPath}`, reason),
      ),
    );
  });
