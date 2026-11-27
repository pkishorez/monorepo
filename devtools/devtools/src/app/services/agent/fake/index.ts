import { Effect, Layer, Stream, SubscriptionRef } from 'effect';
import type { Schema } from 'effect';
import {
  statusOf,
  threadOf,
} from '../../../agent/server/rpc/agent/contract/index.js';
import {
  Agent,
  AgentProblem,
  type Message,
  type Question,
  type Thread,
} from '../contract/index.js';

export type Reply =
  | {
      readonly text?: string;
      readonly data?: Schema.Json;
      readonly activity?: ReadonlyArray<string>;
    }
  | { readonly failed: string; readonly activity?: ReadonlyArray<string> };

export type Asked = Question & { readonly thread: string };

interface Entry {
  readonly thread: Omit<Thread, 'title' | 'status'>;
  readonly system?: string;
  readonly messages: SubscriptionRef.SubscriptionRef<ReadonlyArray<Message>>;
}

const repliedWith = (reply: Reply, at: number): ReadonlyArray<Message> => {
  const activity = (reply.activity ?? []).map((text): Message => ({
    _tag: 'Activity',
    text,
    at,
  }));
  if ('failed' in reply)
    return [
      ...activity,
      { _tag: 'Status', status: 'failed', reason: reply.failed, at },
    ];
  return [
    ...activity,
    {
      _tag: 'Assistant',
      ...(reply.text === undefined ? {} : { text: reply.text }),
      ...(reply.data === undefined ? {} : { data: reply.data }),
      at,
    },
    { _tag: 'Status', status: 'done', at },
  ];
};

export const fakeAgent = (replies: ReadonlyArray<Reply> = []) =>
  Effect.sync(() => {
    const asked: Array<Asked> = [];
    const waiting = [...replies];
    const entries = new Map<string, Entry>();

    const find = (thread: string) =>
      Effect.suspend(() => {
        const entry = entries.get(thread);
        return entry === undefined
          ? Effect.fail(new AgentProblem({ message: `No thread ${thread}.` }))
          : Effect.succeed(entry);
      });

    const tell = (entry: Entry, messages: ReadonlyArray<Message>) =>
      SubscriptionRef.update(entry.messages, (all) => [...all, ...messages]);

    const answer = (entry: Entry, question: Asked) =>
      Effect.suspend(() => {
        asked.push(question);
        const at = Date.now();
        const next = waiting.shift();
        return tell(entry, [
          { _tag: 'User', text: question.prompt, at },
          { _tag: 'Status', status: 'running', at },
          ...(next === undefined ? [] : repliedWith(next, at)),
        ]);
      });

    const running = (entry: Entry) =>
      Effect.map(
        SubscriptionRef.get(entry.messages),
        (all) => statusOf(all) === 'running',
      );

    const layer = Layer.succeed(Agent)({
      ask: (question) =>
        Effect.gen(function* () {
          const entry: Entry = {
            thread: {
              id: crypto.randomUUID(),
              folder: question.folder,
              kind: question.kind,
              createdAt: Date.now(),
              mcp: question.mcp === true,
            },
            ...(question.system === undefined
              ? {}
              : { system: question.system }),
            messages: yield* SubscriptionRef.make<ReadonlyArray<Message>>([]),
          };
          entries.set(entry.thread.id, entry);
          yield* answer(entry, { ...question, thread: entry.thread.id });
          return entry.thread.id;
        }),
      followUp: ({ thread, prompt, schema }) =>
        Effect.gen(function* () {
          const entry = yield* find(thread);
          if (yield* running(entry))
            return yield* Effect.fail(
              new AgentProblem({ message: 'This thread is still answering.' }),
            );
          yield* answer(entry, {
            thread,
            folder: entry.thread.folder,
            kind: entry.thread.kind,
            prompt,
            ...(entry.system === undefined ? {} : { system: entry.system }),
            ...(schema === undefined ? {} : { schema }),
          });
        }),
      threads: (folder, kind) =>
        Effect.forEach(
          [...entries.values()].filter(
            (entry) =>
              entry.thread.folder === folder && entry.thread.kind === kind,
          ),
          (entry) =>
            Effect.map(SubscriptionRef.get(entry.messages), (messages) =>
              threadOf(entry.thread, messages),
            ),
        ).pipe(Effect.map((threads) => threads.toReversed())),
      watch: (thread) =>
        Stream.unwrap(
          Effect.map(find(thread), (entry) =>
            SubscriptionRef.changes(entry.messages),
          ),
        ),
      cancel: (thread) =>
        Effect.gen(function* () {
          const entry = yield* find(thread);
          if (yield* running(entry))
            yield* tell(entry, [
              { _tag: 'Status', status: 'cancelled', at: Date.now() },
            ]);
        }),
      clear: (folder, kind) =>
        Effect.sync(() => {
          const cleared = [...entries.values()].filter(
            ({ thread }) => thread.folder === folder && thread.kind === kind,
          );
          for (const { thread } of cleared) entries.delete(thread.id);
          return cleared.length;
        }),
    });

    const reply = (thread: string, given: Reply) =>
      Effect.gen(function* () {
        const entry = yield* find(thread);
        if (yield* running(entry))
          yield* tell(entry, repliedWith(given, Date.now()));
      });

    return { asked, layer, reply };
  });
