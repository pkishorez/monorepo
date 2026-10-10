import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Session, SignedIn } from '../session/index.js';

/*
 * The signed-in site: Dashboard and Settings as States, with no router.
 *
 * Both pages draw the session, but a Child is created with nothing (`init`
 * takes no input) and its View sees only its own Model. So it starts in
 * Opening, whose Lifetime reads SignedIn once and sends Opened with the
 * session: one extra Message per sign-in, to copy data the parent already has.
 */

export const LoggedInPages = Actor.make('LoggedInPages', {
  requires: { signedIn: SignedIn },
  state: Schema.TaggedUnion({
    Opening: {},
    Dashboard: { session: Session },
    Settings: { session: Session },
  }),
  message: Schema.TaggedUnion({
    Opened: { session: Session },
    ClickedDashboard: {},
    ClickedSettings: {},
    ClickedLogout: {},
  }),
}).build({
  init: () => ({ state: { _tag: 'Opening' } }),
  lifetime: {
    Opening: (self) =>
      Effect.gen(function* () {
        const { session } = yield* SignedIn;
        yield* self.send({ _tag: 'Opened', session });
      }),
  },
  update: {
    Opening: {
      Opened: ({ session }) => ({ state: { _tag: 'Dashboard', session } }),
    },
    Dashboard: {
      ClickedSettings: (_, { state }) => ({
        state: { _tag: 'Settings', session: state.session },
      }),
      ClickedLogout: () => ({ command: logOut }),
    },
    Settings: {
      ClickedDashboard: (_, { state }) => ({
        state: { _tag: 'Dashboard', session: state.session },
      }),
      ClickedLogout: () => ({ command: logOut }),
    },
  },
});

/** Ask the app to sign out: a Request. */
const logOut = Effect.gen(function* () {
  yield* (yield* SignedIn).logOut();
});

type Send = (
  message:
    | { readonly _tag: 'ClickedDashboard' }
    | { readonly _tag: 'ClickedSettings' }
    | { readonly _tag: 'ClickedLogout' },
) => void;

const Nav = ({
  page,
  name,
  send,
}: {
  readonly page: 'Dashboard' | 'Settings';
  readonly name: string;
  readonly send: Send;
}) => (
  <nav className="flex items-center gap-1 border-b px-6 py-2">
    {(['Dashboard', 'Settings'] as const).map((each) => (
      <Button
        key={each}
        size="sm"
        variant={each === page ? 'secondary' : 'ghost'}
        onClick={() => send({ _tag: `Clicked${each}` })}
      >
        {each}
      </Button>
    ))}
    <span className="ml-auto text-sm text-muted-foreground">{name}</span>
    <Button
      size="sm"
      variant="ghost"
      onClick={() => send({ _tag: 'ClickedLogout' })}
    >
      Sign out
    </Button>
  </nav>
);

const STATS = [
  ['Total sessions', '42'],
  ['Active projects', '7'],
  ['Tasks completed', '128'],
] as const;

export const LoggedInView = View.make(LoggedInPages, {
  Opening: () => null,
  Dashboard: ({ state, send }) => (
    <>
      <Nav page="Dashboard" name={state.session.name} send={send} />
      <section className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">
          Welcome back, {state.session.name}!
        </h1>
        <div className="grid gap-4 sm:grid-cols-3">
          {STATS.map(([label, value]) => (
            <div key={label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  ),
  Settings: ({ state, send }) => (
    <>
      <Nav page="Settings" name={state.session.name} send={send} />
      <section className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <dl className="flex flex-col divide-y rounded-lg border text-sm">
          {(['userId', 'email', 'name'] as const).map((key) => (
            <div key={key} className="flex justify-between p-3">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="font-medium">{state.session[key]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  ),
});
