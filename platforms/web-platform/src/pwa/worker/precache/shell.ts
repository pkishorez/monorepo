import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { type BuildId, precacheCacheName } from '../../contract/build/index.js';
import {
  attempt,
  fetchNetwork,
  GlobalScope,
  openCache,
} from '../global-scope/index.js';
import { downloadPage } from './download.js';

/*
 * The App Shell, kept in this build's Precache as the worker installs: all
 * the worker keeps of the app's pages. The paths are written here rather
 * than imported, so the worker carries none of Kabuki Start. An app not on
 * Start, or Start in dev without a build, answers nothing usable: the worker
 * then installs with the assets alone and every page is the network's.
 */

/** Where Kabuki Start says what it serves. */
const PAGES_URL = '/_kabuki/pages';
/** Where Kabuki Start serves the App Shell. */
export const SHELL_URL = '/_kabuki/shell';

const Pages = Schema.Struct({
  /** The server build that answers; the App Shell must be its. */
  build: Schema.optional(Schema.String),
  shell: Schema.Literal(SHELL_URL),
});

const decode = Schema.decodeUnknownOption(Pages);

/**
 * Asks Start which build it is and saves its App Shell into this build's
 * Precache. An app that says it is not on Start, with a `4xx` or an answer
 * that is not Start's, installs without one. Anything else that keeps the App
 * Shell from being saved fails install, which the browser tries again: a
 * network or server failure, or an App Shell that will not download.
 */
export const installShell = (
  buildId: BuildId,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const response = yield* fetchNetwork(PAGES_URL, { cache: 'reload' });
    if (response.status >= 500) {
      return yield* Effect.fail(
        new Error(`Install failed: ${PAGES_URL} (${response.status})`),
      );
    }
    if (!response.ok) return;
    const body = yield* attempt(() => response.text());
    const pages = Option.liftThrowable(JSON.parse)(body).pipe(
      Option.flatMap(decode),
    );
    if (Option.isNone(pages)) return;
    const cache = yield* openCache(precacheCacheName(buildId));
    yield* downloadPage(
      cache,
      new URL(SHELL_URL, scope.origin).href,
      pages.value.build,
    );
  });
