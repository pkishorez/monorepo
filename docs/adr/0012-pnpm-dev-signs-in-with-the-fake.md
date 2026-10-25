# `pnpm dev` signs in with the Fake, and a production build cannot carry it

An app could not run in development without the Auth Worker: a dev server opened through a Cloudflare tunnel, on a phone or by a remote agent, sits outside the Shared Cookie Domain, so neither the Auth Worker's cookie nor the backends' origin checks let it in. So `pnpm dev` now signs in with auth-toolkit's Fake everywhere at once (the site, every backend Worker, and Connect's Machine), and the dev server serves every backend on the site's own origin at `/rpc-<name>`, so one tunnel reaches the whole app. `pnpm dev:real` (`KESTACK_AUTH=real`) keeps today's real sign-in, on `*.kishore.computer` only. The Web Platform decides this for every app; an app's code does not change between dev and production.

The switch is auth-toolkit's `kestack-fake-auth` export condition: its `server`, `client/browser` and `client/device` doors resolve to drop-in Fakes of the same shape under it. Only development sets it (the Web Platform's Vite preset for the browser, its `backend` for a Worker's rolldown build, Node's `--conditions` for the Machine). A production build is checked for the Fake's mark and fails if it carries it, whatever brought it in; the check cannot be turned off. A Fake that got deployed anyway admits only `@kestack.test` users, made from the email alone, so it reaches no real User's data; a real backend never accepts a Fake Token.

## Considered Options

- **A runtime flag** (`AUTH_FAKE=1`) read by the real doors: rejected, as ADR 0016 of auth-toolkit did: one wrong setting away from a production backend that admits anyone.
- **Import aliases** set by each bundler: rejected for the export condition, which is the standard mechanism, written once in the package, and the same in Vite, rolldown and Node.
- **Test Sign-In on the real Auth Worker through the tunnel**: rejected; it still needs the Auth Worker reachable and the tunnel's host trusted by it, which weakens production.
- **Any email for a Fake Account**: rejected; restricting it to `@kestack.test` and re-deriving the User from the email turns a leaked Fake from "anyone is anyone" into "anyone is a fake User".

## Consequences

- Production still serves each API on its own domain; moving them onto the site's paths, as development now does, is the follow-up this decision points to.
- One branch's Connect signs in one way at a time: a Fake Machine keeps its own folders (`<branch>-fake`), and starting a run of the other kind while one runs is refused.
- Every `VITE_<NAME>_URL` but `VITE_AUTH_URL` is taken for a backend under `pnpm dev`.
