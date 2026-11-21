# Two modes, real and fake; the fake-auth export condition goes

Supersedes [ADR 0012](./0012-pnpm-dev-signs-in-with-the-fake.md).

ADR 0012 made `pnpm dev` sign in with auth-toolkit's Fake by an export condition, `kestack-fake-auth`, that swapped the real `server`, `client/browser` and `client/device` doors for Fakes, with `pnpm dev:real` (`KESTACK_AUTH=real`) to sign in for real. That made three ways to run an app: production, development over the real backends with a fake sign-in, and development for real. The middle one ran real backends behind a guard that believed anyone, and was the only one a tunnel reached.

Code now runs in **fake mode**: the whole app in a browser tab, its middle the real code, only the outside world faked, by Fakes a bubble on the page controls. So there are two modes only:

- **Real**: production, real sign-in; deployed or run locally. auth-toolkit's doors are always the real ones.
- **Fake**: everything in the tab, over the app's Fakes (auth-toolkit's Sign-in fake among them). An app imports its fakes itself, lazily, in fake mode only.

The export condition and its doors go, and with them the Web Platform's `dev-auth` (the Vite and Alchemy wiring that set the condition, and the backends served at `/rpc-<name>` for it), Connect's fake dev sign-in, and `dev:real`.

The production check stays, generalised: every fake module carries the mark `kestack-fake` in its code (auth-toolkit's `/fake`, Connect's `/fake` and `/browser`, devtools-kabuki's `/fake`, ai-toolkit's `/harness/fake` and `/speech/fake`), and the Web Platform's `noFake` fails a production build any of whose chunks carries it, a lazy one too. It cannot be turned off.

## Consequences

- `pnpm dev` of an app that has no fake mode runs for real, signing in through the Auth Worker on `*.kishore.computer`; a tunnel to it no longer signs in.
- An app's fake mode must keep its fakes out of a production build entirely, not only out of the first chunk: a lazy import a production build can reach still fails it.
