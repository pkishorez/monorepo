import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  PubSub,
  Stream,
  type Take,
} from 'effect';
import {
  type Event,
  type Methods,
  OpenCodeError,
  type Prompt,
  type SessionID,
  type SessionInfo,
  type UserMessage,
} from '../contract/index.js';
import { type Delivery, Driver, sessionOf } from '../shared/index.js';
import {
  methods,
  type Recording,
  recordings,
  session,
} from './recordings/index.js';

export interface FakeOptions {
  readonly recordings?: Readonly<Record<string, Recording>>;
  readonly methods?: Readonly<Partial<Record<keyof Methods, unknown>>>;
}

const fixture = <A>(value: unknown) => value as A;

const recording = (events: unknown) => fixture<Recording>(events);

interface Fake {
  readonly bus: PubSub.PubSub<Take.Take<Event, OpenCodeError>>;
  readonly waiting: Map<string, Deferred.Deferred<void>>;
  replay: Fiber.Fiber<void> | undefined;
  running: boolean;
}

const terminal = new Set([
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
]);

const requestOf = (event: Event): string | undefined =>
  event.type === 'permission.asked'
    ? event.data.id
    : event.type === 'form.created'
      ? event.data.form.id
      : undefined;

const inboxOf = (event: Event): string | undefined =>
  event.type === 'session.inbox.enqueued' ||
  event.type === 'session.inbox.delivered'
    ? event.data.inboxID
    : undefined;

export const layerFake = (options: FakeOptions = {}) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const played = options.recordings ?? recordings;
      const answers: Readonly<Partial<Record<keyof Methods, unknown>>> =
        options.methods ?? methods;
      const fakes = new Map<string, Fake>();
      let count = 0;
      const fresh = (prefix: string) => {
        count += 1;
        return `${prefix}_fake${String(count).padStart(8, '0')}`;
      };

      const find = (id: SessionID) => {
        const fake = fakes.get(id);
        return fake === undefined
          ? Effect.fail(
              new OpenCodeError({ message: `Session not found: ${id}` }),
            )
          : Effect.succeed(fake);
      };

      const open = Effect.gen(function* () {
        const id = fresh('ses') as SessionID;
        const bus = yield* PubSub.unbounded<Take.Take<Event, OpenCodeError>>();
        fakes.set(id, {
          bus,
          waiting: new Map(),
          replay: undefined,
          running: false,
        });
        return fixture<SessionInfo>({ ...session, id });
      });

      const event = (type: string, data: object) =>
        fixture<Event>({ id: fresh('evt'), created: Date.now(), type, data });

      const publish = (fake: Fake, events: ReadonlyArray<Event>) =>
        Effect.forEach(events, (one) => PubSub.publish(fake.bus, [one]), {
          discard: true,
        });

      const replay = (
        id: SessionID,
        fake: Fake,
        events: Recording,
        user: UserMessage,
      ) =>
        Effect.gen(function* () {
          const first = events[0];
          const original = first === undefined ? undefined : sessionOf(first);
          const own = events.map(inboxOf).find((inbox) => inbox !== undefined);
          const kept = events.filter((one) => {
            const inbox = inboxOf(one);
            return inbox === undefined || inbox === own;
          });
          const renamed = [
            ...(typeof original === 'string' ? [[original, id]] : []),
            ...(own === undefined ? [] : [[own, user.id]]),
            ...kept
              .map(requestOf)
              .flatMap((request) =>
                request === undefined ? [] : [[request, fresh('per')]],
              ),
          ].reduce(
            (text, [from = '', to = '']) => text.replaceAll(from, to),
            JSON.stringify(kept),
          );
          const replayed = recording(JSON.parse(renamed));
          for (const one of replayed) {
            yield* PubSub.publish(fake.bus, [one]);
            const request = requestOf(one);
            if (request !== undefined) {
              const answered = yield* Deferred.make<void>();
              fake.waiting.set(request, answered);
              yield* Deferred.await(answered);
            }
          }
          if (!replayed.some((one) => terminal.has(one.type))) {
            yield* PubSub.publish(fake.bus, Exit.void);
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              fake.running = false;
              fake.waiting.clear();
            }),
          ),
        );

      const prompt = (id: SessionID, input: Prompt, delivery?: Delivery) =>
        Effect.gen(function* () {
          const fake = yield* find(id);
          const user = fixture<UserMessage>({
            id: fresh('msg'),
            sessionID: id,
            time: { created: new Date().toISOString() },
            type: 'user',
            payload: { text: input.text },
            delivery: delivery ?? 'steer',
          });
          if (delivery === 'steer' && fake.running) {
            yield* publish(fake, [
              event('session.inbox.enqueued', {
                sessionID: id,
                inboxID: user.id,
                item: { type: 'user', payload: { text: input.text }, delivery },
              }),
              event('session.inbox.delivered', {
                sessionID: id,
                inboxID: user.id,
              }),
            ]);
            return user;
          }
          const events = played[input.text] ?? Object.values(played)[0] ?? [];
          fake.running = true;
          fake.replay = yield* replay(id, fake, events, user).pipe(
            Effect.forkIn(scope),
          );
          return user;
        });

      const answer = (name: keyof Methods) => () =>
        name in answers
          ? Effect.succeed(answers[name] as never)
          : Effect.fail(
              new OpenCodeError({ message: `The fake has no ${name}` }),
            );

      return Driver.of({
        create: () => open,
        fork: (input) => find(input.sessionID).pipe(Effect.andThen(open)),
        events: (id) =>
          Effect.gen(function* () {
            const fake = yield* find(id);
            const subscription = yield* PubSub.subscribe(fake.bus);
            return Stream.fromSubscription(subscription).pipe(
              Stream.flattenTake,
            );
          }),
        prompt,
        interrupt: (id) =>
          Effect.gen(function* () {
            const fake = yield* find(id);
            const running = fake.replay;
            if (!fake.running || running === undefined) return;
            yield* Fiber.interrupt(running);
            yield* publish(fake, [
              event('session.execution.interrupted', {
                sessionID: id,
                reason: 'user',
              }),
            ]);
          }),
        reply: (id, requestId) =>
          Effect.gen(function* () {
            const fake = yield* find(id);
            const waiting = fake.waiting.get(requestId);
            if (waiting === undefined) {
              return yield* new OpenCodeError({
                message: `No pending request ${requestId}`,
              });
            }
            fake.waiting.delete(requestId);
            yield* Deferred.succeed(waiting, undefined);
          }),
        methods: {
          sessions: answer('sessions'),
          session: answer('session'),
          messages: answer('messages'),
          message: answer('message'),
          context: answer('context'),
          diff: answer('diff'),
          compact: answer('compact'),
          revert: answer('revert'),
          unrevert: answer('unrevert'),
          commitRevert: answer('commitRevert'),
          update: answer('update'),
          remove: answer('remove'),
          switchModel: answer('switchModel'),
          switchAgent: answer('switchAgent'),
          permissions: answer('permissions'),
          forms: answer('forms'),
          providers: answer('providers'),
          models: answer('models'),
          defaultModel: answer('defaultModel'),
          agents: answer('agents'),
          commands: answer('commands'),
          skills: answer('skills'),
          config: answer('config'),
          mcp: answer('mcp'),
          usageLimits: answer('usageLimits'),
        },
        client: Effect.fail(
          new OpenCodeError({ message: 'The fake has no OpenCode client' }),
        ),
      });
    }),
  );
