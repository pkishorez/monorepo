import { Router } from '@kestack/kabuki/routing';
import { Rise, Screen } from './sign-in.tsx';

/** `/`, which names no page of its own: the root page places it. */
const ROOT = { _tag: 'NotFound' as const, path: '/' };

/*
 * What an address that names no page draws, whoever is signed in: it
 * says so, and links home, `/`, which the root page sends to the home of
 * the Account active, or to signing in.
 */

export function NowhereScreen() {
  return (
    <Screen waits={false}>
      <Rise order={0}>
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          Nothing lives at this address
        </h1>
      </Rise>
      <Rise order={1}>
        <Router.Link
          to={ROOT}
          className="text-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          Go home
        </Router.Link>
      </Rise>
    </Screen>
  );
}
