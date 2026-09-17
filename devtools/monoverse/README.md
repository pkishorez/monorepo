# monoverse

Private engine behind the DevTools Monoverse Tool. Given a pnpm monorepo root
it returns the Monorepo analysis: every Package, the dependencies between them
matched by name, and any Package cycles. Discovery only; it enforces nothing.

See [CONTEXT.md](./CONTEXT.md) for the vocabulary.
