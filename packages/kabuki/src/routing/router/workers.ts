import type { AnyRoute } from '../capabilities/index.ts';
import { Effect, Option, Queue, Stream } from 'effect';
import { Loading } from '../capabilities/index.ts';
import { Adapter } from './adapter/index.ts';
import { dueRuns, loadPlace } from './data.ts';
import type { Loads } from './loads.ts';
import type { RouterModel, RoutesLike, Send } from './model.ts';
import type { Moves } from './moves.ts';
import type { Urls } from './urls.ts';

/*
 * The Router's Workers: each place on screen loading its data when due,
 * the pending move's load and its wait, the first pages' data kept in the
 * Data cache, and the address heard through the Adapter.
 */
export const workersOf = <Route extends AnyRoute>(
  routes: RoutesLike<Route>,
  { inside, shows }: Urls<Route>,
  { current, shown, addressOf }: Moves<Route>,
  { load }: Loads<Route>,
) => {
  const { delay, minimum } = routes.options;
  type Model = RouterModel<Route>;
  type Send = SendOf<Route>;
  const workers = {
    // Loads the data of each place on screen whose data is due.
    place: {
      each: ({ model }: { readonly model: Model }) =>
        dueRuns(routes, shown(model), model.data, model.reload),
      run: (
        self: {
          readonly send: Send;
          readonly get: Effect.Effect<{ readonly model: Model }>;
          readonly now: Effect.Effect<number>;
        },
        run: string,
      ) =>
        loadPlace(routes, run, minimum, {
          send: self.send,
          get: Effect.map(self.get, ({ model }) => ({
            route: shown(model),
            holding: model.data,
            reload: model.reload,
          })),
          now: self.now,
        }),
    },
    // Loads the data the pending move wants; a newer move stops it.
    load: {
      each: ({ model }: { readonly model: Model }) =>
        model.pending ? [String(model.pending.id)] : [],
      run: (self: {
        readonly send: Send;
        readonly get: Effect.Effect<{ readonly model: Model }>;
      }) =>
        Effect.gen(function* () {
          const { pending } = (yield* self.get).model;
          if (pending) yield* load(pending, self.send);
        }),
    },
    // Lands a move still loading after the delay; a held reload waits on.
    wait: {
      each: ({ model }: { readonly model: Model }) =>
        model.pending && !model.pending.hold ? [String(model.pending.id)] : [],
      run: (self: {
        readonly send: Send;
        readonly get: Effect.Effect<{ readonly model: Model }>;
        readonly now: Effect.Effect<number>;
      }) =>
        Effect.gen(function* () {
          const { pending } = (yield* self.get).model;
          if (!pending) return;
          const now = yield* self.now;
          yield* Effect.sleep(Math.max(0, pending.since + delay - now));
          yield* self.send({ _tag: 'Waited', id: pending.id });
        }),
    },
    // Keeps what the pages drawn first were handed, as a server's page
    // hands them, in the Data cache: Back to them is at once, as to a
    // page loaded in the browser.
    keep: {
      run: (self: { readonly get: Effect.Effect<{ readonly model: Model }> }) =>
        Effect.gen(function* () {
          const found = yield* Effect.serviceOption(Loading);
          if (Option.isNone(found) || !found.value.keep) return;
          const { model } = yield* self.get;
          if (model.move.how !== 'load') return;
          for (const { name, params, input } of routes.places(shown(model))) {
            const status = model.data[name]?.status;
            // Arrived when the page says, so the copy goes stale when
            // the page says it does.
            if (input && status?._tag === 'Ready')
              yield* found.value.keep(
                { name, params },
                status.data,
                status.info.arrivedAt,
              );
          }
        }),
    },
    // Hears the address, if an Adapter holds one: Back, Forward, a typed URL.
    address: {
      run: (self: {
        readonly send: Send;
        readonly get: Effect.Effect<{ readonly model: Model }>;
      }) =>
        Effect.gen(function* () {
          const found = yield* Effect.serviceOption(Adapter);
          if (Option.isNone(found)) return;
          const at = found.value;
          // Attached already, the Runtime started again on a History this
          // Router wrote the address from, as a Fork does: its entry is
          // the truth, and the address is put back there, not followed.
          let carried = (yield* self.get).model.attached;
          if (!carried)
            yield* self.send({
              _tag: 'Attached',
              session: Math.random().toString(36).slice(2, 10),
            });
          const changes = Stream.callback<null>((queue) =>
            Effect.acquireRelease(
              Effect.sync(() => {
                Queue.offerUnsafe(queue, null);
                return at.listen(() => void Queue.offerUnsafe(queue, null));
              }),
              (stop) => Effect.sync(stop),
            ),
          );
          yield* Stream.runForEach(changes, () =>
            Effect.gen(function* () {
              const first = carried;
              carried = false;
              const url = inside(at.url());
              if (url === undefined) return;
              const { model } = yield* self.get;
              const entry = current(model);
              const target = model.pending?.to;
              // The Router's own write coming back, or the address of a move still loading: nothing moved.
              if (at.key() === entry.key && shows(url, entry.route)) return;
              if (target && url === routes.path(target)) return;
              if (first) {
                const kept = model.entries.findIndex(
                  (one) => one.key === at.key(),
                );
                if (kept >= 0 && kept !== model.at) at.go(model.at - kept);
                else at.replace(addressOf(entry), entry.key);
                return;
              }
              yield* self.send({
                _tag: 'Arrived',
                route: routes.read(url).route,
                key: at.key(),
                url,
                hash: at.hash?.() ?? '',
              });
            }),
          );
        }),
    },
  };
  return workers;
};

type SendOf<Route extends AnyRoute> = Send<Route>;
