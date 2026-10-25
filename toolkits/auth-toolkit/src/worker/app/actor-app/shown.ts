import { Effect, Queue, Stream } from 'effect';
import { Navigation } from '@kestack/kabuki/routing';
import { Api, type Accounts } from '../api/index.ts';

/** A page's data, when its status is Ready. */
export const readyData = <D>(status: {
  readonly _tag: string;
  readonly data?: D;
}): D | undefined => (status._tag === 'Ready' ? status.data : undefined);

const same = (
  shown: Accounts,
  now: {
    readonly active: string | null;
    readonly accounts: ReadonlyArray<{ readonly id: string }>;
  },
) =>
  shown.active === now.active &&
  shown.list.length === now.accounts.length &&
  shown.list.every((account) =>
    now.accounts.some(({ id }) => id === account.id),
  );

/**
 * A page's Worker: each time the page is shown again, as after another tab
 * switched or signed out, who is signed in here is held against the
 * Accounts the page was drawn with; when they differ, its data is no one's
 * any more and is loaded anew, which drops every copy the Data cache kept.
 * A page shown again while its data is still on its way is checked once it
 * arrives: that data may have been read for the Account before. `drawn` is
 * the Accounts the page is drawn with, each time its data changes.
 */
export const followAccounts = (drawn: Stream.Stream<Accounts | undefined>) =>
  Effect.gen(function* () {
    const api = yield* Api;
    const navigation = yield* Navigation;
    const shown = yield* Queue.sliding<void>(1);
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        api.onShown(() => void Queue.offerUnsafe(shown, undefined)),
      ),
      (stop) => Effect.sync(stop),
    );
    const check = Effect.gen(function* () {
      const accounts = yield* Stream.runHead(
        Stream.filter(drawn, (each) => each !== undefined),
      );
      if (accounts._tag === 'None') return;
      const now = yield* api.accounts;
      if (!same(accounts.value, now)) yield* navigation.reload({ anew: true });
    }).pipe(Effect.ignore);
    return yield* Effect.forever(Effect.andThen(Queue.take(shown), check));
  });

/** `followAccounts` for a page whose data carries the Accounts, as every page's does. */
export const followPageAccounts = <
  S extends {
    readonly props: {
      readonly status: {
        readonly _tag: string;
        readonly data?: { readonly accounts: Accounts };
      };
    };
  },
>(self: {
  readonly changes: Stream.Stream<S>;
}) =>
  followAccounts(
    Stream.map(self.changes, ({ props }) => readyData(props.status)?.accounts),
  );
