# Snapshot CLI

The `std-toolkit` binary checks a project's storage contract against an
approved baseline file. It complements `table.verifySnapshot()`, which keeps a
baseline inside the table itself. Vocabulary is in
[src/snapshot/CONTEXT.md](../src/snapshot/CONTEXT.md); the decision to let the
CLI own approval is [ADR 0003](./adr/0003-cli-owns-snapshot-approval.md).

## Setup

Create `std-toolkit.snapshot.ts` in the project root. It default-exports one
schema or table snapshot:

```ts
import { table } from './src/table.js';

export default table.snapshot();
```

The command loads the TypeScript entry through Jiti, so no build step is
needed. Pass `--cwd <dir>` when the file lives somewhere else.

## Commands

```sh
std-toolkit snapshot approve   # write std-toolkit.snapshot.json
std-toolkit snapshot           # compare against it
```

- `approve` is the only command that writes the baseline. Commit the JSON file
  so Git keeps its history.
- `snapshot` exits with status 1 when the current contract differs from the
  baseline or when no baseline exists. It prints only the breaking, backfill,
  unverifiable, and safe changes.
- Operational failures (missing entry file, load error) exit with status 2.

## CI

```yaml
# GitHub Actions
- run: pnpm std-toolkit snapshot
```

## Comparing snapshots in code

The same comparison is available without the CLI through
`std-toolkit/snapshot`:

```ts
import { readFile } from 'node:fs/promises';
import { Effect } from 'effect';
import { Snapshot } from 'std-toolkit/snapshot';

const current = Snapshot.capture(User);
const stored = JSON.parse(await readFile('contracts/user.json', 'utf8'));
const baseline = await Effect.runPromise(Snapshot.decode(stored));

const diagnostics = Snapshot.inspect(current);
const changes = Snapshot.diff(baseline, current);

console.log(Snapshot.render(current));
console.log(Snapshot.renderChanges(changes));
```

## Known limitation: local symbols

`Schema.UniqueSymbol` is the one field kind the definition-time check lets
through even though capture may fail. Capture supports only registered symbols
created with `Symbol.for(...)`. A local `Symbol(...)` can build an ESchema, but
capture fails because the symbol has no stable identity to store and restore.
