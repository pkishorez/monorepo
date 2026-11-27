import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Effect, FiberMap, Semaphore, Stream, SubscriptionRef } from 'effect';
import { Claude } from '@kestack/ai-toolkit-v2/claude';
import {
  AgentError,
  AgentRpc,
  statusOf,
  threadOf,
  type JsonSchema,
  type Message,
} from '../contract/index.js';
import { failed, messagesOf, optionsOf } from './claude-run.js';

interface Entry {
  readonly id: string;
  readonly folder: string;
  readonly createdAt: number;
  readonly system: string | undefined;
  readonly mcp: boolean;
  readonly messages: SubscriptionRef.SubscriptionRef<ReadonlyArray<Message>>;
  session: string | undefined;
}

type Opened = { readonly real: string } | { readonly problem: string };

const opened = (folder: string): Effect.Effect<Opened> =>
  isAbsolute(folder)
    ? Effect.promise(() =>
        stat(folder).then(
          async (info): Promise<Opened> =>
            info.isDirectory()
              ? { real: await realpath(folder).catch(() => folder) }
              : { problem: `${folder} is not a folder.` },
          () => ({ problem: `${folder} does not exist.` }),
        ),
      )
    : Effect.succeed({ problem: `${folder} is not an absolute path.` });

const handlers = (mcp: string) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const runs = yield* FiberMap.make<string>();
    const lock = yield* Semaphore.make(1);
    const entries = new Map<string, Entry>();

    const find = (thread: string) =>
      Effect.suspend(() => {
        const entry = entries.get(thread);
        return entry === undefined
          ? Effect.fail(
              new AgentError({
                reason: 'unknown-thread',
                message: `There is no thread ${thread}: threads last until DevTools restarts.`,
              }),
            )
          : Effect.succeed(entry);
      });

    const tell = (entry: Entry, messages: ReadonlyArray<Message>) =>
      messages.length === 0
        ? Effect.void
        : SubscriptionRef.update(entry.messages, (all) => [
            ...all,
            ...messages,
          ]);

    const isRunning = (entry: Entry) =>
      Effect.map(
        SubscriptionRef.get(entry.messages),
        (all) => statusOf(all) === 'running',
      );

    const tellIfRunning = (entry: Entry, messages: ReadonlyArray<Message>) =>
      SubscriptionRef.update(entry.messages, (all) =>
        statusOf(all) === 'running' ? [...all, ...messages] : all,
      );

    const converse = (
      entry: Entry,
      real: string,
      prompt: string,
      schema: JsonSchema | undefined,
    ) => {
      const input = {
        cwd: entry.folder,
        prompt,
        options: optionsOf(entry.system, schema, entry.mcp ? mcp : undefined),
      };
      const run =
        entry.session === undefined
          ? claude.create(input)
          : claude.send({ ...input, id: entry.session });
      return run.pipe(
        Stream.runForEach((out) =>
          Effect.suspend(() => {
            if (out._tag === 'Started') entry.session = out.id;
            return tell(entry, messagesOf(real, out, Date.now()));
          }),
        ),
        Effect.catch((error) =>
          tell(entry, [failed(error.message, Date.now())]),
        ),
        Effect.andThen(
          Effect.suspend(() =>
            tellIfRunning(entry, [
              failed('Claude Code stopped without an answer.', Date.now()),
            ]),
          ),
        ),
      );
    };

    const start = (
      entry: Entry,
      prompt: string,
      schema: JsonSchema | undefined,
    ) =>
      Effect.gen(function* () {
        const at = Date.now();
        yield* tell(entry, [
          { _tag: 'User', text: prompt, at },
          { _tag: 'Status', status: 'running', at },
        ]);
        const folder = yield* opened(entry.folder);
        if ('problem' in folder)
          return yield* tell(entry, [failed(folder.problem, Date.now())]);
        yield* FiberMap.run(
          runs,
          entry.id,
          converse(entry, folder.real, prompt, schema),
        );
      });

    return AgentRpc.of({
      ask: ({ folder, prompt, system, schema, mcp: withMcp = false }) =>
        Effect.gen(function* () {
          const entry: Entry = {
            id: crypto.randomUUID(),
            folder,
            createdAt: Date.now(),
            system,
            mcp: withMcp,
            messages: yield* SubscriptionRef.make<ReadonlyArray<Message>>([]),
            session: undefined,
          };
          entries.set(entry.id, entry);
          yield* lock.withPermits(1)(start(entry, prompt, schema));
          return entry.id;
        }),
      followUp: ({ thread, prompt, schema }) =>
        Effect.flatMap(find(thread), (entry) =>
          lock.withPermits(1)(
            Effect.gen(function* () {
              if (yield* isRunning(entry))
                return yield* Effect.fail(
                  new AgentError({
                    reason: 'busy',
                    message:
                      'This thread is still answering: cancel it or wait for its answer.',
                  }),
                );
              yield* start(entry, prompt, schema);
            }),
          ),
        ),
      threads: ({ folder }) =>
        Effect.forEach(
          [...entries.values()].filter((entry) => entry.folder === folder),
          (entry) =>
            Effect.map(SubscriptionRef.get(entry.messages), (messages) =>
              threadOf(
                {
                  id: entry.id,
                  folder: entry.folder,
                  createdAt: entry.createdAt,
                  mcp: entry.mcp,
                },
                messages,
              ),
            ),
        ).pipe(
          Effect.map((threads) =>
            threads.toSorted((a, b) => b.createdAt - a.createdAt),
          ),
        ),
      watch: ({ thread }) =>
        Stream.unwrap(
          Effect.map(find(thread), (entry) =>
            SubscriptionRef.changes(entry.messages),
          ),
        ),
      cancel: ({ thread }) =>
        Effect.flatMap(find(thread), (entry) =>
          lock.withPermits(1)(
            Effect.gen(function* () {
              if (!(yield* isRunning(entry))) return;
              yield* FiberMap.remove(runs, entry.id);
              if (entry.session !== undefined)
                yield* Effect.ignore(claude.cancel(entry.session));
              yield* tellIfRunning(entry, [
                { _tag: 'Status', status: 'cancelled', at: Date.now() },
              ]);
            }),
          ),
        ),
    });
  });

export const agentRpcLayer = ({ mcp }: { readonly mcp: string }) =>
  AgentRpc.toLayer(handlers(mcp));
