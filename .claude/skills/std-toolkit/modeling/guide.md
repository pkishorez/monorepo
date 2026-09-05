# Modeling

## Start with the change

1. Inspect existing schemas, entities, tables, and staged and unstaged changes.
2. Ask what the app needs to store, what is changing, and how it needs to read the data.
3. Use the **grilling** skill to settle missing design decisions; reuse answers already given.
4. Propose the model, placement, and any migration in plain language.
5. Implement after the user agrees to that proposal; an existing agreement is sufficient.

Keep questions and explanations brief. Finish discovery when fields, identity, access patterns, and the version-change approach are settled.

## How the pieces connect

- An **evolving schema** defines data fields and version changes.
- An **entity** uses a schema and table to define identity, keys, and named access patterns.
- An **STD table** defines the primary keys and available indexes.

Prefer one table per app; reuse an existing table when it fits.
Propose additional tables when the requirements justify them.

## Read the relevant topic

- For schema choice, optionality, drafts, or evolutions, read [e-schema.md](e-schema.md).
- For entity identity, table keys, or indexes, read [table.md](table.md).
- Before changing existing fields, nested schemas, stored versions, or indexes affected by migration, read [edge-cases.md](edge-cases.md).

## Placement and naming

Use the **laymos** skill to choose layers and module dependencies.
Use the **deep-module** skill for entity, table, and independently reusable schema modules, with the export exception below.

Put pure modeling definitions in the existing domain layer by default.
Propose a dedicated modeling layer when different dependency rules would help.
Keep database connections and execution outside these pure definitions.

Within the chosen layer:

```text
app-model/                 # Module graph; no index.ts of its own
  app-table/
    index.ts
    app-table.ts
  order-item/
    index.ts
    order-item.ts          # Entity definition
    schema.ts              # Evolving schema definition
```

Keep an entity and its schema together by default.
Start with one app modeling graph and declare `order-item → app-table` for this example.
Expose entity modules for cross-layer callers; expose the table module only when another layer needs it.
A graph may expose multiple entity modules because each is an independently consumed modeling capability.
If another graph in the same layer needs a schema, extract it into a shared module outside the graph; Laymos forbids imports between those graphs.
Reflect agreed boundaries and dependency rules in the project’s Laymos configuration.

**Modeling exception to deep-module:** `index.ts` stays a pure barrel, but may export the entity from `<name>.ts` and the schema directly from `schema.ts` when callers need it.
The matching `<name>.ts` remains mandatory; other modules follow the usual export rule.

```ts
// app-model/order-item/index.ts
export { orderItemEntity } from './order-item.js';
export { orderItemSchema } from './schema.js';
```

| Item                                    | Convention | Example                                             |
| --------------------------------------- | ---------- | --------------------------------------------------- |
| Folders and files                       | kebab-case | `order-item/order-item.ts`                          |
| Schema and entity identifiers and names | camelCase  | `orderItemSchema`, `'orderItem'`, `orderItemEntity` |
| Table variables                         | camelCase  | `appTable`                                          |
| Index key attributes                    | lowercase  | `gsi1pk`, `gsi1sk`, `gsi2pk`, `gsi2sk`              |
| Table index names                       | uppercase  | `GSI1`, `GSI2`                                      |
| Entity index aliases                    | camelCase  | `byUpdated`                                         |

## Verify and confirm

Compare staged and unstaged changes against committed schema definitions.
Immediately flag edits to existing versions or migration steps and ask whether they are intentional.
Show the affected version, whether it has stored data, and the proposed draft, evolution, or direct edit.
This is a user confirmation step, not an automatic rejection.
An earlier confirmation covers the same proposal.
Adding a new evolution does not require this extra history-edit confirmation.

Check examples and implementation against the installed toolkit APIs.
Run the project’s relevant type checks and Laymos checks.
For schema changes, verify representative old values decode and current values encode correctly.
For drafts, verify both mappings, including any discarded fields.
For entity or table changes, verify the agreed keys and reads.

Finish with what changed, what was checked, and anything still unverified.
