# Console is rewritten as a deploy platform that runs the user's own Alchemy code

The first Console opened on state stores and deleted stages by running Alchemy's `Plan.destroy` in its own Worker, so it could only destroy resource types whose providers it bundled; custom resources defined in a user's `alchemy.run.ts` were out of reach. We rewrite Console from scratch around projects instead: a user connects GitHub, imports a repository, and Console deploys and destroys each stage by running that repository's own `alchemy deploy` and `alchemy destroy` on a runner Console owns, so every resource type the user's code defines works.

The frontend is a Kabuki app served by Kabuki Start; every change to data goes through an Effect RPC API built with `rpc-toolkit`, guarded by `auth-toolkit`, over `std-toolkit` entities. Nothing from the first Console is carried over by default.

Console does not host Alchemy state. Each project keeps the state store its own code chooses (`Cloudflare.state()`, `AWS.state()`, …); Console supplies only credentials, so the user's code needs no Console-specific line.

## Considered Options

- **Keep the store-first Console and bundle more providers.** Rejected: it can never reach custom resources.
- **Run deploys in the user's GitHub Actions.** Rejected for the first version: the repository needs a workflow file before the first deploy, so importing a project cannot deploy at once.
