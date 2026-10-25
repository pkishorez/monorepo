import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duration, Effect, Layer, Stream } from 'effect';
import {
  HarnessAccount,
  HarnessError,
  isRecord,
  OneShotPrompt,
} from '../../contract/index.js';
import { start, type AppServer, type ThreadItem } from '../app-server/index.js';
import { listModels } from '../catalog/index.js';
import { TEXT_CHUNK, type TextChunk } from './streams.js';
import { openSession, restore } from './thread.js';

/** The small model the spec names; used whenever this account lists it. */
const SMALL_MODEL = 'gpt-6-luna';
const ONE_SHOT_TIMEOUT = Duration.seconds(30);

/**
 * gpt-6-luna when the account lists it; otherwise the account's own luna
 * (small, fast) model, else its default. ChatGPT accounts reject unlisted
 * models outright.
 */
const smallModel = (server: AppServer) =>
  listModels(server).pipe(
    Effect.map(
      (models) =>
        (
          models.find((model) => model.id === SMALL_MODEL) ??
          models.find((model) => model.id.includes('luna')) ??
          models.find((model) => model.isDefault === true) ??
          models[0]
        )?.id ?? SMALL_MODEL,
    ),
  );

const tempFolder = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), 'ai-toolkit-one-shot-')),
    catch: (cause) =>
      new HarnessError({
        message: 'No temp folder for the One-shot Prompt',
        cause,
      }),
  }),
  (folder) =>
    Effect.promise(() => rm(folder, { recursive: true, force: true })),
);

const prompt = (text: string) =>
  Effect.gen(function* () {
    // The caller's Harness Account when it gives one, else the installed Codex.
    const account = yield* Effect.serviceOption(HarnessAccount).pipe(
      Effect.map((found) =>
        found._tag === 'Some'
          ? found.value
          : { binary: undefined, configFolder: undefined },
      ),
    );
    const cwd = yield* tempFolder;
    const server = yield* start(cwd).pipe(
      Effect.provideService(HarnessAccount, account),
    );
    const session = yield* openSession(server, {
      cwd,
      model: yield* smallModel(server),
      sandbox: 'read-only',
      effort: 'low',
      ephemeral: true,
    });
    const chunks: Record<string, Array<string>> = {};
    const reply = yield* session.turn({ text, images: [] }).out.pipe(
      Stream.runFold(
        () => '',
        (last, out) => {
          if (!isRecord(out) || out.agentId !== undefined) return last;
          if (out.kind === TEXT_CHUNK) {
            const chunk = out.payload as unknown as TextChunk;
            (chunks[chunk.streamId] ??= []).push(chunk.text);
            return last;
          }
          if (out.kind !== 'item/completed') return last;
          const { item } = restore(out.payload, chunks) as unknown as {
            item: ThreadItem;
          };
          return item.type === 'agentMessage' ? item.text : last;
        },
      ),
    );
    return reply.trim();
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: ONE_SHOT_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new HarnessError({ message: 'Codex took too long to answer' }),
        ),
    }),
  );

/**
 * One-shot Prompts answered by Codex: a read-only, ephemeral thread on a
 * small model, in a temp folder, with no Agent behind it.
 */
export const codexOneShot = Layer.succeed(OneShotPrompt, { prompt });
