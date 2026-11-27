import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  Deferred,
  Effect,
  FiberMap,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import { Claude } from '@kestack/ai-toolkit-v2/claude';
import {
  ThreadStore,
  type ThreadStoreError,
} from '../../../services/thread-store/contract/index.js';
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
  readonly kind: string;
  readonly createdAt: number;
  readonly system: string | undefined;
  readonly mcp: boolean;
  readonly messages: SubscriptionRef.SubscriptionRef<ReadonlyArray<Message>>;
  readonly gone: Deferred.Deferred<void>;
  session: string | undefined;
  next: number;
}

type Opened = { readonly real: string } | { readonly problem: string };

const RESTARTED = 'DevTools restarted before this answer finished.';

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

const unsaved = (error: ThreadStoreError) =>
  new AgentError({ reason: 'unsaved', message: error.message });

const handlers = (mcp: string) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const store = yield* ThreadStore;
    const runs = yield* FiberMap.make<string>();
    const lock = yield* Semaphore.make(1);
    const entries = new Map<string, Entry>();

    const saved = yield* store.all().pipe(Effect.orElseSucceed(() => []));
    for (const { thread, messages, next } of saved) {
      const cut =
        statusOf(messages) === 'running' ? [failed(RESTARTED, Date.now())] : [];
      yield* Effect.ignore(store.append(thread.id, next, cut));
      entries.set(thread.id, {
        id: thread.id,
        folder: thread.folder,
        kind: thread.kind,
        createdAt: thread.createdAt,
        system: thread.system ?? undefined,
        mcp: thread.mcp,
        messages: yield* SubscriptionRef.make<ReadonlyArray<Message>>([
          ...messages,
          ...cut,
        ]),
        gone: yield* Deferred.make<void>(),
        session: thread.session ?? undefined,
        next: next + cut.length,
      });
    }

    const find = (thread: string) =>
      Effect.suspend(() => {
        const entry = entries.get(thread);
        return entry === undefined
          ? Effect.fail(
              new AgentError({
                reason: 'unknown-thread',
                message: `There is no thread ${thread}: it was cleared, or never asked.`,
              }),
            )
          : Effect.succeed(entry);
      });

    const tell = (entry: Entry, messages: ReadonlyArray<Message>) =>
      messages.length === 0
        ? Effect.void
        : Effect.uninterruptible(
            Effect.gen(function* () {
              const from = entry.next;
              entry.next += messages.length;
              yield* store.append(entry.id, from, messages);
              yield* SubscriptionRef.update(entry.messages, (all) => [
                ...all,
                ...messages,
              ]);
            }),
          );

    const fail = (entry: Entry, reason: string) =>
      tell(entry, [failed(reason, Date.now())]).pipe(
        Effect.catch((error) =>
          SubscriptionRef.update(entry.messages, (all) => [
            ...all,
            failed(error.message, Date.now()),
          ]),
        ),
      );

    const settle = (entry: Entry, message: Message) =>
      tell(entry, [message]).pipe(
        Effect.catch(() =>
          SubscriptionRef.update(entry.messages, (all) => [...all, message]),
        ),
      );

    const isRunning = (entry: Entry) =>
      Effect.map(
        SubscriptionRef.get(entry.messages),
        (all) => statusOf(all) === 'running',
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
          Effect.gen(function* () {
            if (out._tag === 'Started') {
              entry.session = out.id;
              yield* Effect.ignore(store.resumed(entry.id, out.id));
            }
            yield* tell(entry, messagesOf(real, out, Date.now()));
          }),
        ),
        Effect.catch((error) => fail(entry, error.message)),
        Effect.andThen(
          Effect.flatMap(isRunning(entry), (running) =>
            running
              ? fail(entry, 'Claude Code stopped without an answer.')
              : Effect.void,
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
        yield* FiberMap.remove(runs, entry.id);
        const at = Date.now();
        yield* tell(entry, [
          { _tag: 'User', text: prompt, at },
          { _tag: 'Status', status: 'running', at },
        ]);
        const folder = yield* opened(entry.folder);
        if ('problem' in folder) return yield* fail(entry, folder.problem);
        yield* FiberMap.run(
          runs,
          entry.id,
          converse(entry, folder.real, prompt, schema),
        );
      }).pipe(Effect.mapError(unsaved));

    const cancelled = (entry: Entry) =>
      Effect.gen(function* () {
        if (!(yield* isRunning(entry))) return;
        yield* FiberMap.remove(runs, entry.id);
        if (entry.session !== undefined)
          yield* Effect.ignore(claude.cancel(entry.session));
        if (!(yield* isRunning(entry))) return;
        yield* settle(entry, {
          _tag: 'Status',
          status: 'cancelled',
          at: Date.now(),
        });
      });

    return AgentRpc.of({
      ask: ({ folder, kind, prompt, system, schema, mcp: withMcp = false }) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const entry: Entry = {
              id: crypto.randomUUID(),
              folder,
              kind,
              createdAt: Date.now(),
              system,
              mcp: withMcp,
              messages: yield* SubscriptionRef.make<ReadonlyArray<Message>>([]),
              gone: yield* Deferred.make<void>(),
              session: undefined,
              next: 0,
            };
            yield* store
              .create({
                id: entry.id,
                folder,
                kind,
                createdAt: entry.createdAt,
                system: system ?? null,
                mcp: withMcp,
                session: null,
              })
              .pipe(Effect.mapError(unsaved));
            entries.set(entry.id, entry);
            yield* start(entry, prompt, schema).pipe(
              Effect.tapError(() =>
                Effect.andThen(
                  Effect.ignore(store.remove(entry.id)),
                  Effect.sync(() => entries.delete(entry.id)),
                ),
              ),
            );
            return entry.id;
          }),
        ),
      followUp: ({ thread, prompt, schema }) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const entry = yield* find(thread);
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
      threads: ({ folder, kind }) =>
        Effect.forEach(
          [...entries.values()].filter(
            (entry) => entry.folder === folder && entry.kind === kind,
          ),
          (entry) =>
            Effect.map(SubscriptionRef.get(entry.messages), (messages) =>
              threadOf(
                {
                  id: entry.id,
                  folder: entry.folder,
                  kind: entry.kind,
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
            SubscriptionRef.changes(entry.messages).pipe(
              Stream.interruptWhen(Deferred.await(entry.gone)),
            ),
          ),
        ),
      cancel: ({ thread }) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const entry = yield* find(thread);
            yield* cancelled(entry);
          }),
        ),
      clear: ({ folder, kind }) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const cleared = [...entries.values()].filter(
              (entry) => entry.folder === folder && entry.kind === kind,
            );
            for (const entry of cleared) {
              yield* cancelled(entry);
              yield* store.remove(entry.id).pipe(Effect.mapError(unsaved));
              entries.delete(entry.id);
              yield* Deferred.succeed(entry.gone, undefined);
            }
            return cleared.length;
          }),
        ),
    });
  });

export const agentRpcLayer = ({ mcp }: { readonly mcp: string }) =>
  AgentRpc.toLayer(handlers(mcp));
