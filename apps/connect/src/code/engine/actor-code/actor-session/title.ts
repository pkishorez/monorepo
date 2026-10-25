import { Duration, Effect } from 'effect';
import { HarnessBinaries, OneShotPrompt } from '@kestack/ai-toolkit/harness';
import { Store } from '../../capabilities/index.js';
import { EngineRaw } from '../../engine-raw/index.js';
import type { SessionQuerySelf, SessionSelf } from './actor.js';

/*
 * A Session's Title: the first line of its first message until a One-shot
 * Prompt has written one, and written again from the user's latest
 * messages when the engine asks the retitle Query.
 */

/** How long the One-shot Prompt may take before the title stays as it is. */
const TITLE_TIMEOUT = Duration.seconds(60);

/** How many of the user's latest messages a Title is written from. */
const TITLE_MESSAGES = 5;

const MAX_WORDS = 6;

/** Each message's share of the prompt, so a long paste cannot crowd the rest out. */
const MESSAGE_CHARS = 2_000;

/** The first line of a message, as a title until a better one comes. */
export const fallbackTitle = (text: string) =>
  text.trim().split('\n')[0]!.trim().slice(0, 60) || 'New session';

/** Asks for a title that names what the session is about now: the latest message leads. */
const prompt = (userMessages: ReadonlyArray<string>) => {
  const messages = userMessages.map((message) =>
    message.length > MESSAGE_CHARS
      ? `${message.slice(0, MESSAGE_CHARS)}…`
      : message,
  );
  const latest = messages.at(-1) ?? '';
  const earlier = messages.slice(0, -1);
  return [
    `Write a title of at most ${MAX_WORDS} words for a coding session, from what its user asked.`,
    earlier.length === 0
      ? 'Name the task the message asks for.'
      : 'Name what the session is about now: the latest message counts most; the earlier ones are context, and a topic they share with it counts too.',
    'Reply with the title only: no quotes, no punctuation at the end, no tools.',
    ...(earlier.length === 0
      ? []
      : [
          '',
          '<earlier-messages>',
          ...earlier.map((message) => `<message>\n${message}\n</message>`),
          '</earlier-messages>',
        ]),
    '',
    '<latest-message>',
    latest,
    '</latest-message>',
  ].join('\n');
};

/**
 * The first line of a reply, without quotes, markdown, or characters that
 * print as nothing (control, private-use and unassigned ones a model may
 * emit), cut to six words.
 */
export const clean = (reply: string): string =>
  (reply.trim().split('\n')[0] ?? '')
    .replace(/\p{C}/gu, '')
    .replace(/^[#*\s"'`“”]+|[*\s"'`“”.:!]+$/g, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, MAX_WORDS)
    .join(' ');

/** A title for `messages`; '' when the One-shot Prompt failed, took too long or wrote none. */
const titled = (messages: ReadonlyArray<string>, why: string) =>
  Effect.gen(function* () {
    const oneShot = yield* OneShotPrompt;
    const binaries = yield* HarnessBinaries;
    return yield* oneShot.prompt(prompt(messages)).pipe(
      // A One-shot Prompt that runs a Harness Binary runs the one the user set.
      Effect.provideService(HarnessBinaries, binaries),
      Effect.timeout(TITLE_TIMEOUT),
      Effect.map(clean),
      Effect.catch((error) =>
        Effect.as(Effect.logWarning(`No title written; ${why}`, error), ''),
      ),
    );
  });

/** The title Worker: asks for a title from the first message, once. */
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

/**
 * The retitle Query: a Title written afresh from the latest messages, or
 * null when none could be, so the Title stays as it is.
 */
export const retitle = (self: SessionQuerySelf) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    const messages = yield* recentUserMessages(model.session.id);
    if (messages.length === 0) return null;
    const found = yield* titled(messages, 'keeping the title');
    return found === '' ? null : found;
  });
