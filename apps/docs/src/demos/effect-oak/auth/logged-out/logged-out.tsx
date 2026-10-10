import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { AuthServer } from '../auth-server/index.js';
import { SignIn } from '../session/index.js';
import { LoginForm, LoginFormView } from './login-form/index.js';

/*
 * The signed-out site: its pages are this Actor's States, with no router.
 * Login has the form as its Child, so leaving the page throws the form away.
 * The form's Capabilities (AuthServer, SignIn) pass through, so this Actor
 * Requires them too.
 */

export const LoggedOutPages = Actor.make('LoggedOutPages', {
  requires: { server: AuthServer, signIn: SignIn },
  state: Schema.TaggedUnion({ Home: {}, Login: {} }),
  message: Schema.TaggedUnion({ ClickedHome: {}, ClickedLogin: {} }),
  children: { Login: { form: LoginForm } },
}).build({
  init: () => ({ state: { _tag: 'Home' } }),
  update: {
    '*': {
      ClickedHome: () => ({ state: { _tag: 'Home' } }),
      ClickedLogin: () => ({ state: { _tag: 'Login' } }),
    },
  },
});

type Page = 'Home' | 'Login';

const Nav = ({
  page,
  send,
}: {
  readonly page: Page;
  readonly send: (
    message:
      | { readonly _tag: 'ClickedHome' }
      | { readonly _tag: 'ClickedLogin' },
  ) => void;
}) => (
  <nav className="flex gap-1 border-b px-6 py-2">
    {(['Home', 'Login'] as const).map((each) => (
      <Button
        key={each}
        size="sm"
        variant={each === page ? 'secondary' : 'ghost'}
        onClick={() => send({ _tag: `Clicked${each}` })}
      >
        {each}
      </Button>
    ))}
  </nav>
);

export const LoggedOutView = View.make(LoggedOutPages, {
  Home: ({ send }) => (
    <>
      <Nav page="Home" send={send} />
      <section className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-muted-foreground">
          The dashboard and settings are only for signed-in users.
        </p>
        <Button
          className="self-start"
          onClick={() => send({ _tag: 'ClickedLogin' })}
        >
          Sign in
        </Button>
      </section>
    </>
  ),
  Login: ({ children, send }) => (
    <>
      <Nav page="Login" send={send} />
      <section className="mx-auto flex max-w-sm flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <LoginFormView node={children.form} />
      </section>
    </>
  ),
});
