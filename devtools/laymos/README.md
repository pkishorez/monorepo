# Laymos

**Layers. Modules. Stories.**

One config that declares your architecture. From it: enforcement rules, and the diagram — the same artifact. The picture you show in onboarding is provably true, because it's generated from the thing that's enforced.

The pitch in one line: **"Declare your architecture once; get enforcement and the diagram for free."**

Successor to `depcruise-viz`. Retired with it: stacks, features, barrels, feature closure.

---

## The Problem

Every team draws an architecture diagram. Every team writes lint rules. They drift apart. The diagram in the wiki lies; the rules in the repo are unreadable. Laymos makes them one thing.

There are three pillars, each answering a different question:

- **Layers** — what are the big boundaries, and who may import whom?
- **Modules** — within a boundary, what are the units, and how do they connect?
- **Stories** — when code actually _runs_, what path does it take?

Layers and modules are static. Stories are runtime. Together: intent, structure, behavior.

---

## Part 1: Layers

### What a layer is

A layer is a **set of folders or files**.

- Paths are **plain prefixes** — a path names a file or a directory subtree. No glob patterns; scattered folders are handled by listing multiple paths.
- Nested paths: **longest matching prefix wins.** Disjointness follows by construction — the only invalid overlap is two layers declaring the identical path, a config error.
- Layers are **explicit**. No implicit layers, no "open" layers that everything can import. If a layer is importable by all, every edge is drawn.

_Why:_ explicitness is the product. Implicit permissions are exactly the ambiguity laymos exists to remove.

### The layer graph

A layer graph is a **DAG** of layers.

- An edge means **"may import."**
- **No edge = forbidden.** Siblings without an edge cannot import each other.
- Reachability is **transitive**: if A→B and B→C, then A may import C.
- Cycles in a graph → config error, validated at config time.

_Why transitive:_ it matches the general flow of software — a root can reach its descendants. We chose relaxed layering over strict layering to avoid noisy edge declarations.

_Why DAG, not tree:_ a "domain" layer importable by many parents means multiple incoming edges. That's a DAG. A tree can't express it.

### Multiple graphs, one truth

A project can define **multiple layer graphs** — e.g. one for frontend, one for backend.

- A layer **may appear in more than one graph**. There is no special "shared layer" kind — just layers, sometimes used in multiple graphs.
- The **union of all graphs must be acyclic.** A→B in one graph and B→A in another is a config error. So is any longer cycle formed across graphs.
- Rules are generated from the **union**. Graphs are how you organize and communicate; the union is what's enforced.
- Reachability follows that union, including paths whose edges are organized into different graphs. Each graph remains a focused view; together they declare the complete architecture.

### Scale

Target: **under 10 layers per graph**, slightly above 10 in the extreme. Layers are the bird's-eye view. Hundreds of layers means you're doing modules' job with layers.

---

## Part 2: Modules

### What a module is

A module is a **file or a folder**.

- Modules are **strictly flat** — no module inside another module.
- A module lives in exactly one layer: the **longest layer prefix containing its path**. Inferred from the path, never declared.
- A module cannot straddle a layer boundary — no layer path may sit inside a module's path (validated structurally, at config time).
- A layer itself can be a module.

_Why flat:_ nesting modules recreates the hierarchy problem layers already solve. One level of granularity per pillar.

### Module rules are opt-in

Defining a module surfaces **no errors by itself**. Modules default-allow; layers default-deny. This asymmetry is deliberate and worth stating loudly:

- **Layers:** drawing the graph _is_ writing the rules. Absence of an edge forbids.
- **Modules:** defining modules is organization. Rules are opted into per module.

_Why:_ layers are few and architectural — full intent is cheap to declare. Modules are many — forcing rules on all of them would make adoption impossible.

### The two module rules

A module may declare constraints on its edges, in either direction:

- **`canImport: [...]`** — this module may only import the listed modules. Disciplines a _consumer_.
- **`canImportedBy: [...]`** — only the listed modules may import this one. Protects a _provider_.

We kept both because neither is expressible with only the other — dropping one means scattering inverted rules across every other module. It's one concept ("module constraints") with two fields, not two rule systems.

Resolution law: **AND semantics, deny wins.** An import A→B is legal iff A's outgoing rule (if configured) allows B _and_ B's incoming rule (if configured) allows A. An unconfigured side has no opinion. Nothing can loosen; rules only tighten.

Intra-module imports (files within the same module) always bypass module rules.

Module rules may constrain modules in the same layer or across layers. A
cross-layer import must satisfy both systems: the layer graph must permit it,
and both modules' configured constraints must permit it. Module rules can
tighten the layer graph but cannot grant permission that the graph denies.

### Layers and modules are decoupled

- **Layer rules bind every file in a layer**, module'd or not.
- **Module rules bind only module'd files.**

_Why:_ an earlier draft made layer enforcement route through modules ("only module'd files play layer rules"). That created a blind spot — layer enforcement, the core feature, would depend on adoption of the opt-in feature. Decoupling kills the blind spot and is also simpler: both rule passes run over the same file-level edge graph, aggregated to different units.

One import can violate both a layer rule and a module rule. Both are reported. No dedupe — they're different intents failing.

---

## Part 3: Coverage & Ignore

Two independent coverage metrics, both **warnings, never errors**:

1. **Layer coverage** — of all files in the repo, how many belong to some layer? Uncovered files are flagged.
2. **Module coverage** — within a layer, how many files belong to some module?

_Why warnings:_ a brownfield repo cannot reach 100% before the first useful run. Coverage is the ratchet, not the gate. Coverage is shown per layer in the viz, nudging teams toward full module definition.

A layer with zero modules is valid config — just 0% module coverage.

The source inventory comes only from configured `sourceRoots`. Each root is a
project-relative file or directory; directories are traversed recursively.
Laymos analyzes JavaScript and TypeScript source files (`js`, `jsx`, `mjs`,
`cjs`, `ts`, `tsx`); declarations, minified files, and non-source assets are
outside the inventory. Git tracking and `.gitignore` never affect analysis.

**Ignore** is a single global set of folders/files, shared by layers and modules:

- Ignored means **invisible, not permitted** — no rules generated, no coverage warnings, imports to/from them unchecked.
- Layered code may freely import ignored files.
- Ignore beats layer paths on conflict. It is the escape hatch (generated code, composition roots, anything).
- Explicitly ignored files remain tagged as ignored in the report so the escape hatch is auditable, but their edges are removed and they do not count toward coverage.

---

## Part 4: Enforcement & Execution

### The check contract

- **Config errors** (overlapping layers, union cycles, module straddling) → hard fail.
- **Rule violations** (layer or module) → fail. Lint errors.
- **Coverage** → warning. Never fails CI.

`import type` **counts as a violation.** Type-only imports cross boundaries at the type level; intent is enforced regardless of runtime erasure. (Reservation on record: shared contract types across frontend/backend — `import type { AppRouter }` — will pressure this rule. Escape hatch deferred; `ignore` covers it for now.)

### How checking actually works

[skott](https://github.com/antoine-coulon/skott) is used as an **extractor only** — run with type-only tracking always on, producing the full file-level import graph (it resolves ESM/CJS/`import type`/TS path aliases). Laymos's own engine owns all semantics:

**extract (skott) → resolve (files → layers/modules) → evaluate (rules) → emit (violations + viz data)**

_Why skott over dependency-cruiser_ (see ADR-0001): identical edge sets in a head-to-head POC, ~30% faster, far simpler graph API. _Why not transpile laymos config into an existing rule engine:_ our semantics (transitive reachability, sink layers, AND-gated module constraints) would compile into O(n²) regex pair-lists with foreign error messages and a transpiler to debug forever. Owning the engine means one evaluation produces both enforcement and visualization, with no drift between them.

### Violations are rich objects

Verdicts are module/layer-level; **evidence is file-level.** (Line numbers and per-edge import kind were considered and dropped — no extractor provides them; both are additive later. ADR-0001.)

```ts
{ kind: "layer",  from: { layer, file }, to: { layer, file } }
{ kind: "module", rule: "canImport" | "canImportedBy",
  from: { module, layer, file }, to: { module, layer, file } }
```

Config speaks modules; violations point at files. That's not an inconsistency — config is intent, evidence is fact.

### Config

One file: **`laymos.config.ts`**, typed default export built with reference builders — cross-references are values, not strings, so they autocomplete and survive renames. Cost accepted: laymos executes user code to read config.

`defineConfig` validates everything decidable from the config alone and throws with all issues at once. Source roots must be non-empty and non-overlapping;
every layer, module, and ignored path must fall within one. The loader
additionally warns — never errors — on declared paths that don't exist on disk:
declaring structure before its folder exists is legitimate intent-first design.

Every module used by a rule must also appear in `modules`, and each module may
have at most one `rules(...)` entry. Rule references must reuse those declared
module values rather than recreating the same path.

```ts
import { defineConfig, edge, layer, layerGraph, module, rules } from 'laymos';

const ui = layer('ui', ['src/ui']);
const domain = layer('domain', ['src/domain']);
const data = layer('data', ['src/data']);

const billing = module('src/domain/billing');
const checkout = module('src/domain/checkout');

export default defineConfig({
  sourceRoots: ['src'],
  graphs: [layerGraph('app', [edge(ui, [domain, data]), edge(domain, data)])],
  modules: [billing, checkout],
  moduleRules: [rules(billing, { canImportedBy: [checkout] })],
  ignore: ['src/generated'],
});
```

Modules are declared and constrained in **two separate acts** (`module()` then `rules()`): mutually-referencing rules would otherwise hit the JS temporal dead zone between `const` bindings — and it mirrors the semantics, since declaring a module imposes nothing.

Configured source roots and paths are project-root-relative plain paths. `src/x` and `./src/x`
are equivalent; separators and redundant segments are normalized. Absolute
paths, escaping `..`, and glob syntax are rejected.

---

## Part 5: Visualization (principles only — details deferred)

Two things are always shown, distinctly:

1. **Declared** — the rules you configured.
2. **Actual** — the real state of the codebase, from the extracted graph.

Per edge, three render states: **declared & used** (healthy), **declared & never used** (dead edge — candidate for tightening), **used & violating**. The allowed/used/violating triad is the product.

The viz payload is self-contained: the labeled file tree plus layer-level rollups, correlated by root-relative file paths — no joins against other outputs needed.

Graphs render side by side; a layer used across graphs spans them horizontally. Selecting a layer or module shows its actual edges — what it imports, what imports it — not just its rules. Rules are validations, never an exhaustive map; the actual state fills the rest.

---

## Part 6: Stories

### The idea

Layers and modules are static intent. Stories capture **runtime behavior at the intent level** — a flowchart of what actually happened, where "do this" might be a thousand lines but is one node.

Not coverage tooling (istanbul knows _which lines_ ran, not _what they meant_). Not XState (we don't make the flowchart be the code — code stays code, the flowchart is derived; annotate what exists, no rewrite).

### Story structure

- **`flow(name, meta, fn)`** marks a reusable function whose nested Story Blocks are traversed.
- **`step(name, meta, thunk)`** marks one opaque operation. Trace Mode records it without calling the thunk.
- **`decision(name, meta, selector)`** records the selector structure and traverses every lazily declared Arm.
- **`omit(label?, thunk)`** records an omission marker without tracing its body.
- **`all`** and **`forEach`** mirror their Effect counterparts and retain their options in the trace.

Every visible primitive and Decision Arm supports `visibility: 'primary' |
'detail'`; the default is `primary`.

```ts
decision('fraud gate', { description: 'Reject high-risk orders' }, () =>
  riskOutcome(order),
)
  .when(
    'approved',
    { name: 'Accept order', description: 'Continue to payment' },
    () => processPayment(order),
  )
  .when(
    'rejected',
    {
      name: 'Reject order',
      description: 'Stop checkout before any payment is captured',
    },
    () => rejectOrder(order),
  )
  .exhaustive();
```

Each `when` removes its literal from the remaining input union and narrows its
callback to that literal. `exhaustive()` is optional when the chain's result is
ignored; when present, it is callable only after the union is fully handled and
returns the selected branch's result. `otherwise(armMeta, fn)` declares one
fallback Arm, narrows its callback to the remaining union, and returns the
selected result. A non-exhaustive chain with no matching Arm does nothing, like
an `if` statement without an `else`. Literal Arms default their narrative name
to the textual form of their literal; the fallback defaults to `Otherwise`.

`laymos/story` provides `yield*`-able Effect builders. Arm callbacks return
Effects; the matching Effect is selected eagerly and runs when the builder is
yielded. `exhaustive()` remains an optional type-level proof (ADR-0002).

Active execution context propagates across Effect fibers. Sequential visits
append to the active execution path; visits that overlap while unfinished
become parallel branches. Each concurrent branch must
be spanned by a marked Block for laymos to reconstruct its nested sequence
reliably. A visit the recorder cannot unambiguously place — it starts while a
sibling visit is unfinished and no marked Block spans its branch — **fails the
Scenario's recording** with an error naming both blocks and their source
locations and the fix: wrap each concurrent branch in a block. Ambiguous
structure is never recorded best-effort; an artifact that finalizes is correct,
not approximate.

Every block callback also establishes a parent scope. `functionBlock`, `step`, and
the selected arm of `decision` may therefore contain visits recursively at any
depth. A `step` can be either a leaf action or a meaningful narrative grouping;
there is no separate grouping block.

Each block carries a required, non-empty static **description** and optional
per-invocation **attributes** — each scenario stamps its own attribute values
into its block visits. Metadata is the mandatory second argument to every
primitive, and every Decision Arm also requires metadata with a non-empty
description. Story and Scenario descriptions follow the same rule.

Dynamic attributes belong only to visits. They never participate in block
identity or folding. Arguments, return values, and errors are never captured
automatically.
The public type is `Readonly<Record<string, unknown>>`. The `attributes` field
accepts either a record or a resolver: function arguments are supplied to a
`functionBlock` resolver, the selected literal to a `decision` resolver, and no
arguments to a `step` resolver. Laymos JSON-serializes the supplied record and
stores the resulting JSON data rather than retaining a live object reference.
In recording mode, serialization failure throws a dedicated error containing
the Block name and source location, causing the Scenario to fail. Values
that serialize follow native `JSON.stringify` semantics. When
no Scenario recorder is active, block wrappers do not evaluate or serialize
attribute resolvers.

_Why declared arms:_ runtime-only tracing can't know an un-run branch exists. Declaring arms gives the tracer the decision's known outcomes. **Accepted limitation:** blocks _inside_ a never-taken arm, or in never-loaded files, are invisible. The arm is shown as unobserved without implying that the story is incomplete. No static analysis for stories — stories are runtime, period.

The Decision Block definition owns every declared Arm. A literal Arm has its
literal structural key; the Otherwise Arm has a reserved internal key. Both
have a required narrative description and may have a distinct narrative name.
Each Decision Visit stores
its `selectedArm`, including when the selected Arm later fails, and its generic
`children` execution path contains everything observed within that Arm. The
Execution Path needs no Decision-specific item type. Every Decision Visit has
a selected Arm; computing the input value happens before the Decision, just as
an `if` condition is evaluated before its body.

_Why explicit wrappers despite invasiveness:_ comment directives orphan on refactor; there's no free lunch, only choosing who pays. Bounded by guidance: **wrap functions, not if-statements.** `decision` is the only blessed intra-function construct. If a team finds that intolerable, stories aren't for them — opt-in per flow, like modules.

Block identity is generated from the project-relative file, line, and column reported by `Error().stack`. Names and descriptions are narrative metadata, not identifiers. Laymos does not resolve source maps or preserve identity across generations: moving code and rerunning the suite intentionally produces a new story artifact.

### What a story is

A Story is one executable implementation narrative for a feature or use case.
Every Scenario prepares different conditions, invokes that same execution
exactly once, and intentionally verifies its result. Their observations
converge into one explanation of how the implementation logic works. A Story
describes only explicitly marked Blocks and makes no completeness claim about
the surrounding code or use case.

- **One story per `<story-name>.story.ts` file** — hard convention, not suggestion. The kebab-case file is the discovery unit; the declared Story name remains independent human-facing metadata. The name deliberately does not contain `.test`, so no test runner ever picks a Story up: stories are not tests.
- A discovered Story file that declares zero Stories or more than one Story is
  an invalid definition. It cannot produce a per-Story artifact and causes the
  execution API to reject rather than returning a test-failure result.
- The Story ID is that file's project-relative path. A Story leaf name is
  unique among siblings, while the same leaf name may appear in different
  Story Groups. Moving the file intentionally creates a new execution identity
  on the next generation.
- Each Scenario prepares one explicit value for the shared Story execution and
  verifies either its success value or typed error. Preparation, verification,
  and optional cleanup are operational phases outside the narrative.
- Scenarios form one flat builder chain. Narrative nesting belongs to Block
  Visits, not to the Story/Scenario hierarchy.
- Scenario names are narrative metadata and need not be unique. A Scenario has
  no generated identifier: it is identified by its declaration position within
  the Story, which the flat synchronous list makes total and deterministic.
- Scenarios run sequentially in declaration order, each at most once per
  generation. There are no retries and no concurrency between Scenarios;
  parallelism inside a Scenario is recorded explicitly by the Execution Path.
- A Scenario outcome is `succeeded`, `failed`, `interrupted`, or `skipped`, as
  determined by the Story runner. An expected typed execution error can produce
  a successful Scenario through `verifyError`; defects and interruptions never
  can. Phase failures remain distinguishable. Skipped Scenarios contain no
  visits.
- Story, Scenario, Block, Decision, and Arm descriptions are required and must
  not be empty. Attributes and custom Arm names remain optional.

```ts
// checkout.story.ts
import { Effect } from 'effect';
import { storyGroup } from 'laymos/story';

const commerce = storyGroup('Commerce', {
  description: 'Customer purchase behavior',
});
const checkout = commerce.group('Checkout', {
  description: 'Order placement and payment behavior',
});

checkout
  .story('Place an order', {
    description: 'Places an order after inventory and payment approval',
  })
  .provide(AppLive)
  .execute((prepared: CheckoutWorld) => checkout(prepared.orderId))
  .scenario(
    'happy path',
    {
      description: 'Completes an eligible order',
    },
    (scenario) =>
      scenario
        .prepare(() => seedEligibleOrder())
        .verify((result, prepared) => verifyCompleted(result, prepared))
        .cleanup((prepared) => removeOrder(prepared.orderId)),
  )
  .scenario(
    'fraud rejected',
    {
      description: 'Rejects a high-risk order before payment authorization',
      timeout: '2 minutes',
    },
    (scenario) =>
      scenario
        .prepare(() => seedRejectedOrder())
        .verifyError((error, prepared) => verifyRejection(error, prepared)),
  );
```

Story Groups are reusable declaration values and normally live in a shared
file. Root Groups use `storyGroup()`, nested Groups use `.group()`, and grouped
Stories use `.story()`. Direct `story()` creates a Standalone Story. Group and
Story names are non-empty path segments and cannot contain `/`; sibling Groups
and Stories share one namespace. Every Group has a required description.

`laymos/story` is the only authoring surface. One optional
Story-level Layer provides the fixed environment used by all lifecycle phases;
Scenarios vary explicit prepared values and service state, never the dependency
graph. Scenario preparation, execution, verification, cleanup, blocks, and
decision arms all return Effects.

### An owned Effect runner (ADR-0004)

Stories run against real integrations — real databases, real APIs — and are
not tests, so laymos owns their execution end-to-end. There is no test
framework anywhere in the story path.

- **Discovery and identity are the runner's.** `laymos stories` discovers
  `*.story.ts` files, loads them through jiti on Node, and the Story ID is the
  file the runner imported — no stack parsing for identity.
- **Sequential, single-process.** Scenarios run in declaration order in one
  process. Module-level state is shared across Story files, exactly as it is
  in production; per-file worker isolation is deliberately absent.
- **Explicit lifecycle, no retries or watch mode.** The builder separates
  preparation, shared execution, verification, and optional cleanup. Every
  runnable Scenario must intentionally verify either a success value or typed
  error. Cleanup runs whenever preparation produced a value.
- **Timeouts protect liveness.** Every Scenario gets a generous default
  timeout (60 seconds), overridable per Scenario (`timeout: '10 minutes'` as
  an Effect `Duration`) and per run (`--timeout`). Timing out interrupts the
  Scenario fiber and is recorded as an `interrupted` outcome.

### Only execution is narrative

Recording is active only while the runner invokes the shared Story execution.
Preparation, verification, and cleanup may call marked production code, but
those calls execute without producing Block Visits. Operational mechanics do
not compete with the explanation of the feature logic.

### The artifact

A generation run records all Scenarios of a Story into **one JSON artifact per Story**: shared Block definitions plus each Scenario's recursive Execution Path of Block Visits. Test result + artifact, from one run.

The artifact preserves blocks separately from their visits. A block is the
shared, source-identified narrative unit; a block visit is one occurrence in
one scenario. The artifact knows two block kinds: `block` and `decision`.
`functionBlock` and `step` both record as `block` — which primitive marked a
block is recording mechanics, not narrative, exactly as the plain and Effect
variants record identically. Only `decision` is distinct, because it owns
declared Arms. A visit has no identifier of its own: its identity is its
position in the Scenario's execution path, and its value contains facts only —
Block ID, outcome, selected Arm when applicable, and optional attributes. It
does not encode parentage, ordering, or next relationships.

The Scenario owns one recursive execution path. The path is an array, so array
order means sequence. A Visit item carries its facts and owns a nested child
path; a Parallel item owns an array of branch paths.

```ts
type StoryId = string;
type BlockId = string;

interface StoryRun {
  readonly schemaVersion: 4;
  readonly generatedAt: number;
  readonly name: string;
  readonly description: string;
  readonly blocks: Readonly<Record<BlockId, Block>>;
  readonly scenarios: readonly Scenario[];
}

type Arm =
  | {
      readonly kind: 'literal';
      readonly value: string | number | boolean;
      readonly name: string;
      readonly description: string;
    }
  | {
      readonly kind: 'otherwise';
      readonly name: string;
      readonly description: string;
    };

type SelectedArm =
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | { readonly kind: 'otherwise' };

type Block =
  | {
      readonly kind: 'block';
      readonly name: string;
      readonly description: string;
      readonly location: StorySourceLocation;
    }
  | {
      readonly kind: 'decision';
      readonly name: string;
      readonly description: string;
      readonly location: StorySourceLocation;
      readonly arms: readonly Arm[];
    };

interface Scenario {
  readonly name: string;
  readonly description: string;
  readonly location: StorySourceLocation;
  readonly outcome: ScenarioOutcome;
  readonly execution: ExecutionPath;
  readonly failures: readonly {
    readonly phase: 'preparation' | 'execution' | 'verification' | 'cleanup';
    readonly message: string;
  }[];
}

type ExecutionPath = readonly ExecutionItem[];

type ExecutionItem =
  | {
      readonly blockId: BlockId;
      readonly outcome: BlockVisitOutcome;
      readonly selectedArm?: SelectedArm;
      readonly attributes?: Readonly<Record<string, unknown>>;
      readonly children: ExecutionPath;
    }
  | { readonly parallel: readonly ExecutionPath[] };
```

Generated identities live in record keys and are not repeated in their values;
visits carry no generated identity at all. Arrays are reserved for meaningful
order. Records are serialized by sorted key for content hashing. The execution
path is the sole source of sequence, parallelism, containment, and visit facts.
There are no visit IDs, parent IDs, next IDs, flow-edge records, or
parallel-group records — a dangling or orphaned visit reference is
unrepresentable.

Every Visit records when it began and how long it ran. Timing uses a hybrid
clock: the Scenario stores its absolute start time and total duration, each
Visit stores a monotonic `startOffsetMillis` relative to the Scenario start
plus its own `durationMillis` — so trace nesting is consistent by
construction and devtools can render a span waterfall directly from the
Execution Path. Completion updates the Visit's outcome to `succeeded`,
`failed`, or `interrupted`; return values and errors are not captured
automatically.

Synchronous throws, Promise rejections, and Effect failures or defects mark a
Visit `failed`. An Effect interruption-only Cause marks it `interrupted`; a
Cause containing both failure and interruption is `failed`. A Scenario timeout
or run interruption marks every still-active Visit `interrupted`. A caught inner failure
does not taint an enclosing Block that handles it and returns normally: the
inner Visit is `failed` and the enclosing Visit is `succeeded`. Errors and
Causes are not captured automatically.

Every scenario preserves the visits observed before failure or interruption.
Uncaught failure marks
the failing visit and each enclosing visit through which it propagates as
failed; cancellation or timeout marks visits still active at interruption as
interrupted. When one visit must be referenced externally, its address is the
Scenario's declaration position plus the visit's structural position in the
execution path — derivable, never stored. The Story runner is the authority
on the Scenario outcome.

### Ephemeral generation

Story artifacts exist only as return values from an explicit generation
request. Laymos writes no index, cache, staging directory, or artifact file.
Callers may keep the returned values in memory for presentation, but a refresh
always runs the requested Stories again and atomically replaces that caller-owned
state.

Generation orders Scenarios by declaration position and Blocks by generated
identity. Sequential order and containment come from the execution path itself.

Finalization also normalizes degenerate forms so one execution has one
canonical representation: empty parallel branches are dropped, a Parallel item
left with a single branch is inlined into its parent path, and one left with
none is removed. A canonical artifact therefore guarantees every Parallel item
has at least two non-empty branches. Consumers trust these invariants and the
Arm rules above; consumers may trust these invariants.

### Node APIs

`laymos/node` exposes discovery and fresh execution:

```ts
discoverStories(baseDir): Effect<StoryCatalog, StoryDiscoveryError>
getStories(baseDir): Effect<StoryCollection, StoryDiscoveryError>
runStory(baseDir, storyId): Effect<StoryRunResult, StoryRunnerError>
runStoryGroup(baseDir, groupPath): Effect<StoriesRunResult, StoryDiscoveryError | StoryRunnerError>
runStories(baseDir, storyIds): Effect<StoriesRunResult, StoryRunnerError>
runAllStories(baseDir): Effect<AllStoriesRunResult, StoryRunnerError>
```

Execution results carry fresh evidence and diagnostics:

```ts
interface StoryRunResult {
  readonly status: 'passed' | 'failed';
  readonly run: StoryRun;
  readonly failures: readonly StoryFailure[];
}

interface StoriesRunResult {
  readonly status: 'passed' | 'failed';
  readonly runs: StoriesRun;
  readonly failures: readonly StoryFailure[];
}
```

`discoverStories` imports every Story module to collect names, descriptions,
and Group ancestry, but it never prepares or executes a Scenario. Story files
and their shared imports must therefore remain declaration-only at module
scope. Discovery validates the complete catalog atomically and reports every
invalid file, conflicting Group declaration, and sibling-name collision
together. `runStoryGroup` performs fresh discovery and executes every Story in
the selected subtree. `runStory` and `runStories` continue to use file-based
Story IDs.

The CLI mirrors group execution with
`laymos stories --group "DynamoDB / Entities"`. A Group selection cannot be
combined with explicit Story file arguments.

The execution APIs run the owned Story runner with `baseDir` as the target
project's root. The runner discovers `*.story.ts` files itself, loads them
through jiti, and executes Scenarios sequentially in a single Node process.
There is no test framework, configuration file, or worker pool in the story
path.

Interrupting an execution API interrupts its Effect. A Scenario timeout is
returned as reportable partial evidence with an `interrupted` Scenario outcome;
the runner then continues with the remaining Scenarios. Each artifact records
`generatedAt` so a caller can label the evidence it currently holds.

`runAllStories` runs every discovered Story to completion and returns
`status: 'failed'` when any Scenario failed or was interrupted. Skipped
Scenarios do not make the aggregate result fail.

Discovering no Story files is a valid complete generation and succeeds with a
passed empty report. `runStory` fails with `StoryRunnerError` when its Story ID
does not resolve to an existing Story file.

A failed or interrupted Scenario is reportable evidence, so a Scenario failure
succeeds with `status: 'failed'` and a finalized result containing the Scenario's
partial Block Visits. Module loading, invalid definitions, and recording
failures fail with `StoryRunnerError` instead. The two result cases are not a
discriminated union because they carry the same data; `status` is the aggregate
test result and Scenario outcomes retain the detail.

An invalid Story definition is also a rejecting failure; rejected requests do
not expose any earlier in-memory results from that request.

### Outside a Scenario

The production `laymos/story` entry has no recording capability. Its `flow`
executes the wrapped function, `step` executes its thunk, and `decision`
performs only the selected branching. Attribute
resolvers are not evaluated, and there is no recorder lookup, source-location
capture, serialization, event emission, or runtime configuration.

During Story execution, the runner uses Jiti to resolve `laymos/story` to a
private `story-runtime` implementation throughout the loaded source graph.
That runtime declares Stories and records Blocks while preserving the public
surface's production semantics. `story-runtime` is deliberately absent from
the package export map, so application code and TypeScript tooling cannot
resolve it as a package subpath. Production logging and replay are outside v1.

---

## The Unifying Principle

Every pillar has the same shape:

> **Static truth + runtime evidence, merged. Declared intent + actual state, both visible.**

- Layers/modules: config (intent) merged with the extracted import graph (reality) → violations + viz.
- Stories: declared arms (shape) merged with recorded scenarios (reality) → observed flow graph.
- Production, later: story graph (map) merged with logs (reality) → replay.

One config. One engine. Enforcement and the diagram are the same artifact.

---

## Package Layout

One package, three subpaths — consumers only pay for what they import:

| Subpath        | Contents                                              | Runs where               |
| -------------- | ----------------------------------------------------- | ------------------------ |
| `laymos`       | Config DSL + types                                    | Anywhere (browser-safe)  |
| `laymos/node`  | analysis engine + Story discovery and fresh execution | Node, dev-time           |
| `laymos/story` | Effect Story builder and blocks                       | Production (Effect apps) |

```
src/
├─ config/     builders: layer, edge, layerGraph, module, rules, defineConfig
├─ engine/     extract (skott) → resolve → evaluate → emit, tagged errors
├─ cli/        effect CLI: laymos lint, laymos stories
├─ story/
│  ├─ core/      declaration model and recorder contract
│  ├─ effect/    → "laymos/story"
│  ├─ story-runtime/ private runner-only implementation
│  ├─ runner/    owned Story runner: discovery, loading, execution
│  └─ artifact/  Story recording and artifact data model
├─ index.ts    → "laymos"
└─ node.ts     → "laymos/node"
```

---

## Technology Choices

| Choice                                                       | Why                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript projects** as the target                        | Import resolution, `import type` semantics, TS path aliases — the ecosystem laymos speaks.                                                            |
| **skott** as extractor only, type-tracking always on         | Identical edge sets to dependency-cruiser in a head-to-head POC, ~30% faster, simpler API (ADR-0001). All rule semantics stay in laymos's own engine. |
| **Own rules engine**                                         | Transitivity, sink layers, AND-gated module constraints don't survive translation to regex pair-lists.                                                |
| **Effect** for the engine, CLI, and Stories                  | One runtime and one failure/concurrency model across authoring and execution (ADR-0002).                                                              |
| **`laymos.config.ts`** single typed file, reference builders | One source of truth; cross-references are values — autocomplete, rename-safe. Cost: config is executed code.                                          |
| **Owned Effect Story runner** (ADR-0004)                     | Stories run real integrations, not tests; mocking, retries, and parallel workers are anti-features. Sequential and single-process.                    |
| **`Error().stack`** for generated block identity             | Zero build-step; project-relative file, line, and column are sufficient within one generated artifact.                                                |
| **Structured JSON log lines** for prod mode                  | One-line runtime cost; correlation is a viewer problem.                                                                                               |

---

## Explicitly Out of Scope / Deferred

- **Runtime coupling beyond imports** (events, pub/sub) — laymos governs static import structure; stories capture executed flows. Coupling without imports is not modeled.
- **Cross-pillar assertions (v2):** a story asserting "this path never touches module X" — runtime evidence checked against layer/module rules. The pillars unify into one enforcement system here. Designed later, deliberately.
- **Escape hatches** beyond `ignore` (per-edge exceptions, baselines) — deferred until real need.
- **Viz specifics** — principles fixed (declared vs actual, triad of edge states, side-by-side graphs), rendering deferred.
- **Line-level violation evidence** and per-edge import kind — dropped for v1 (ADR-0001); additive later.
- **Production replay viewer** — format designed, feature deferred.
- **Naming of graph-views** — "layer graph" for now; parked.
