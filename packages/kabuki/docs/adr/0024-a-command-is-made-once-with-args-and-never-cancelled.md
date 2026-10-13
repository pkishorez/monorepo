# A Command is made once, with args, and is never cancelled

A Command is made once, outside any Update, with `Command.make(name, { args, run })`: a name, the Schema of its args (optional) and an Effect run from those args. An Update asks for it by calling it with its args, so what was asked for is data a test can compare without running anything. This is the only way to write a Command; the inline `{ name, run }` goes. The Runtime checks the args against their Schema before the Command runs, as every value is checked ([ADR 0020](0020-every-value-is-checked-against-its-schema.md)); a mismatch is a defect, reported like any Command failure. The Update stays pure because it only builds the data. The error channel stays `never`: a Command turns its own failures into its Message, so a "Saving..." always ends.

Nothing about how a Command runs changes. It is fire and forget: it runs on its Instance's Scope until it ends or the Instance stops, it is never in the Log, and Replay never runs it. Gaining args does not mean gaining a cancel. ADR 0016 still holds.

## Considered Options

- **Interruptible Commands (FoldKit's `interrupt`, ADR 0011's keys, an explicit `cancel`, or "a new Command of the same name replaces the running one")**: rejected. "Latest wins" is already a Worker whose `each` returns one key, `model.query ? [model.query] : []`. When the key changes, the old Worker's Scope closes before the next Message is handled, so a late result cannot land. A cancellable Command would be a second owner of running work beside the Model, which is the thing [ADR 0016](0016-work-is-a-command-or-a-worker.md) removed.
- **Fork a Command asked for in a State's block into that State's Scope**: rejected. It is lifecycle-bound interruption through the back door. A Command that outlives its State finishes, and its Message is ignored where there is no rule for it. Work that must die with a State is a Worker in that State's block.
- **Let `each` also return `string | null`**: rejected. It would give one idea two shapes for everything that reads a Condition. `x ? [x] : []` is one line.
- **Record the Commands an Update asked for in the Log**: rejected. A Command is an internal fact, and Replay never runs one.
- **Plain TypeScript types for args instead of a Schema**: rejected. They would skip the check every other value gets.
