import { Duration, Effect } from 'effect';
import {
  HarnessBinaries,
  Titler,
} from '../../../../../services/harness/contract/index.js';
import { Store } from '../../../../../services/records/store/index.js';
import { EngineRaw } from '../../../engine-raw/index.js';
import type { SessionSelf } from './actor.js';

/*
 * A Session's Title: the first line of its first message until the Titler
 * has had its say, and written again from the user's latest messages when
 * the engine asks at the Desk.
 */

/** How long the Titler may take before the title stays as it is. */
const TITLE_TIMEOUT = Duration.seconds(60);

/** How many of the user's latest messages a Title is written from. */
const TITLE_MESSAGES = 5;

/** The first line of a message, as a title until a better one comes. */
export const fallbackTitle = (text: string) =>
  text.trim().split('\n')[0]!.trim().slice(0, 60) || 'New session';

/** The Titler's title for `messages`, trimmed; '' when it failed or took too long. */
const titled = (messages: ReadonlyArray<string>, why: string) =>
  Effect.gen(function* () {
    const titler = yield* Titler;
    const binaries = yield* HarnessBinaries;
    return yield* titler.title(messages).pipe(
      // A Titler that runs a Harness Binary runs the one the user set.
      Effect.provideService(HarnessBinaries, binaries),
      Effect.timeout(TITLE_TIMEOUT),
      Effect.map((title) => title.trim()),
      Effect.catch((error) =>
        Effect.as(Effect.logWarning(`Titler failed; ${why}`, error), ''),
      ),
    );
  });

/** The title Worker: asks the Titler about the first message, once. */
export const title = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const text = model.untitled ?? '';
    const found = yield* titled([text], 'keeping the first line');
    yield* self.send({
      _tag: 'Titled',
      title: found === '' ? fallbackTitle(text) : found,
    });
  });

/** The user's latest messages in a Session, oldest first, steers included. */
const recentUserMessages = (sessionId: string) =>
  Effect.gen(function* () {
    const feed = (yield* Store).raws(sessionId);
    const texts: Array<string> = [];
    let cursor: string | null = null;
    while (true) {
      const page: Effect.Success<ReturnType<typeof feed.after>> =
        yield* feed.after(cursor, 500);
      for (const { value } of page.items) {
        const text = EngineRaw.startedOf(value)?.text.trim();
        if (text) texts.push(text);
      }
      if (!page.hasMore || page.items.length === 0)
        return texts.slice(-TITLE_MESSAGES);
      cursor = page.items.at(-1)!.meta._u;
    }
  });

/** Writes the Title afresh from the latest messages; the Title after. */
export const retitle = (self: SessionSelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const current = model.session.title;
    const messages = yield* recentUserMessages(model.session.id);
    if (messages.length === 0) return current;
    const found = yield* titled(messages, 'keeping the title');
    if (found === '') return current;
    yield* self.send({ _tag: 'Titled', title: found });
    return found;
  });
