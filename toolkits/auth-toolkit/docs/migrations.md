# Migrations

The package owns one fixed schema and its Migration Recipe. Both are
generated; neither is edited by hand.

## After changing the Auth Worker's model

Run once from `toolkits/auth-toolkit` and commit the result:

```sh
pnpm db:generate
```

This runs the Better Auth Relations v2 adapter to regenerate
`src/infra/primary/sqlite/schema/schema.generated.ts`, formats it, then runs
Drizzle Kit to add a timestamped folder under
`src/infra/primary/sqlite/migration/migrations/` containing `migration.sql`
and `snapshot.json`.

Do not edit `schema.generated.ts` or any migration folder by hand. Normal
builds never regenerate them; `pnpm build` only copies the folders into
`dist/`.

## How migrations are applied

- **D1.** `d1PrimaryDatabaseResource` hands the shipped folders to Alchemy, which applies pending migrations on every `alchemy deploy`. Consumers configure nothing.
- **In-memory.** `memoryPrimaryDatabase()` runs the same `.sql` files against a `:memory:` SQLite database, so tests exercise the real schema.

The generator config includes every plugin the toolkit supports, so the same
recipe serves deployments with and without the Authorization Server Role. See
[ADR 0008](./adr/0008-the-migration-recipe-is-role-independent.md).

Drizzle ORM and Kit are pinned to `1.0.0-rc.4`. The baseline targets fresh
databases.
