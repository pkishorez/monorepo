import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duration, Effect, Layer, Stream } from 'effect';
import { HarnessError, Titler } from '../../harness/index.js';
import { start, type AppServer, type ThreadItem } from './app-server/index.js';
import { openSession } from './session.js';

/** The titling model the spec names; used whenever this account lists it. */
const TITLE_MODEL = 'gpt-6-luna';
const TITLE_TIMEOUT = Duration.seconds(30);
const MAX_WORDS = 6;

const prompt = (text: string) =>
  [
    `Write a title of at most ${MAX_WORDS} words for a coding session that starts with the message below.`,
    'Reply with the title only: no quotes, no punctuation at the end, no tools.',
    '',
    '<message>',
    text,
    '</message>',
  ].join('\n');

/**
 * gpt-6-luna when the account lists it; otherwise the account's own luna
 * (small, fast) model, else its default. ChatGPT accounts reject unlisted
 * models outright.
 */
const titleModel = (server: AppServer) =>
  server.request('model/list', { includeHidden: false }).pipe(
    Effect.map(({ data }) => {
      const ids = data.filter((model) => !model.hidden);
      return (
        (
          ids.find((model) => model.id === TITLE_MODEL) ??
          ids.find((model) => model.id.includes('luna')) ??
          ids.find((model) => model.isDefault) ??
          ids[0]
        )?.id ?? TITLE_MODEL
      );
    }),
  );

/** The first line of a reply, without quotes or markdown, cut to six words. */
const clean = (reply: string): string =>
  (reply.trim().split('\n')[0] ?? '')
    .replace(/^[#*\s"'`“”]+|[*\s"'`“”.:!]+$/g, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, MAX_WORDS)
    .join(' ');

const tempFolder = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), 'ai-toolkit-title-')),
    catch: (cause) =>
      new HarnessError({ message: 'No temp folder for the titler', cause }),
  }),
  (folder) =>
    Effect.promise(() => rm(folder, { recursive: true, force: true })),
);

const title = (text: string) =>
  Effect.gen(function* () {
    const cwd = yield* tempFolder;
    const server = yield* start(cwd);
    const session = yield* openSession(server, {
      cwd,
      model: yield* titleModel(server),
      sandbox: 'read-only',
      effort: 'low',
      ephemeral: true,
    });
    const reply = yield* session.turn(prompt(text)).pipe(
      Stream.runFold(
        () => '',
        (last, out) => {
          if (out.kind !== 'item/completed' || out.agentId !== undefined)
            return last;
          const { item } = out.payload as unknown as { item: ThreadItem };
          return item.type === 'agentMessage' ? item.text : last;
        },
      ),
    );
    const cleaned = clean(reply);
    if (cleaned === '')
      return yield* new HarnessError({ message: 'Codex wrote no title' });
    return cleaned;
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: TITLE_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new HarnessError({ message: 'Codex took too long to write a title' }),
        ),
    }),
  );

/** Titles a session with a one-shot, read-only Codex in a temp folder. */
export const codexTitler = Layer.succeed(Titler, { title });
