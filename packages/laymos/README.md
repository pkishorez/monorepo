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
- **If a layer appears in more than one graph, it must be a sink** — it declares no outgoing edges.
- The **union of all graphs must be acyclic.** A→B in one graph and B→A in another is a config error. So is any longer cycle formed across graphs.
- Rules are generated from the **union**. Graphs are how you organize and communicate; the union is what's enforced.
- Reachability **never tunnels across graphs.** The sink rule guarantees this structurally: a multi-graph layer has no outgoing edges, so nothing can route through it.

_Why the sink rule:_ without it, a layer used in two graphs becomes a tunnel — frontend code could legally reach backend internals through a shared layer, and neither graph would show the path. Making shared usage sink-only kills the problem with one sentence instead of a permission system.

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

The source inventory comes from Git: tracked files plus untracked files that
are not ignored by Git. Laymos analyzes JavaScript and TypeScript source files
(`js`, `jsx`, `mjs`, `cjs`, `ts`, `tsx`); declarations, minified files, and
non-source assets are outside the inventory. This keeps generated and local
artifacts out without making a second ignore list mandatory.

**Ignore** is a single global set of folders/files, shared by layers and modules:

- Ignored means **invisible, not permitted** — no rules generated, no coverage warnings, imports to/from them unchecked.
- Layered code may freely import ignored files.
- Ignore beats layer paths on conflict. It is the escape hatch (generated code, composition roots, anything).
- Explicitly ignored files remain tagged as ignored in the report so the escape hatch is auditable, but their edges are removed and they do not count toward coverage. Git-ignored files never enter the report.

---

## Part 4: Enforcement & Execution

### The check contract

- **Config errors** (overlapping layers, union cycles, non-sink multi-graph layers, module straddling) → hard fail.
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

`defineConfig` validates everything decidable from the config alone and throws with all issues at once. The loader additionally warns — never errors — on declared paths that don't exist on disk: declaring a layer before its folder exists is legitimate intent-first design.

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
  graphs: [layerGraph('app', [edge(ui, [domain, data]), edge(domain, data)])],
  modules: [billing, checkout],
  moduleRules: [rules(billing, { canImportedBy: [checkout] })],
  ignore: ['src/generated'],
});
```

Modules are declared and constrained in **two separate acts** (`module()` then `rules()`): mutually-referencing rules would otherwise hit the JS temporal dead zone between `const` bindings — and it mirrors the semantics, since declaring a module imposes nothing.

Configured paths are project-root-relative plain paths. `src/x` and `./src/x`
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

### The primitives — exactly three

- **`storyFn(name, meta, fn)`** — a named function-boundary block.
- **`step(name, meta, fn)`** — a named inline block.
- **`decision(name, meta, key, arms)`** — a named condition with **declared arms**; the condition expression computes the key inline, the chosen arm runs and is recorded. A boolean key selects `true`/`false` arms.

```ts
const result = await decision(
  'fraud gate',
  { description: 'Reject high-risk orders' },
  score > 0.7 ? 'rejected' : 'approved',
  {
    approved: () => processPayment(order),
    rejected: () => rejectOrder(order),
  },
);
```

Effect users get `yield*`-able companions from **`laymos/story/effect`** — arms are Effects, types inferred across arms. Plain `laymos/story` stays zero-dependency because it ships inside production bundles (ADR-0002).

Nesting and call-graphs come free from serial execution — a plain stack, push/pop, no AsyncLocalStorage needed.

Each block carries a static **description** and per-invocation **attributes** — each test run stamps its own attribute values into the trace.

_Why declared arms:_ runtime-only tracing can't know an un-run branch exists. Declaring arms gives the tracer shape for free — an unvisited arm shows in the graph as a coverage gap. **Accepted limitation:** blocks _inside_ a never-taken arm, or in never-loaded files, are invisible. The unvisited arm itself flags the gap; what's behind it is terra incognita. No static analysis for stories — stories are runtime, period.

_Why explicit wrappers despite invasiveness:_ comment directives orphan on refactor; there's no free lunch, only choosing who pays. Bounded by guidance: **wrap functions, not if-statements.** `decision` is the only blessed intra-function construct. If a team finds that intolerable, stories aren't for them — opt-in per flow, like modules.

Block location: call-site line via `Error().stack`. Start line only, not full range — accepted.

### What a story is

A story = a set of test paths whose union of traces forms **one flow graph**.

- **One story per file** — hard convention, not suggestion. The file is the isolation unit _and_ the parallelism unit.
- Each path is one test covering one route through the flow.

```ts
// checkout.story.ts
import { story, path } from 'laymos/vitest';

story("checkout", () => {
  path("happy path", async () => { ... });
  path("fraud rejected", async () => { ... });
});
```

`story`/`path` live in `laymos/vitest`, not `laymos/story` — they only ever run in test files, keeping the production subpath free of the vitest dependency.

### Vitest is the substrate

We don't reinvent the runner. Fixtures, mocks, transforms, jsdom, watch mode — vitest provides them; a bespoke runner would relitigate all of it.

- Laymos ships a **vitest config preset** (serial pool enforced per file) and a **custom reporter** that collects traces into story artifacts.
- **Serial within a story file; parallel across files** — native vitest behavior gives story-level parallelism for free, one process per story.
- Everything runs in Node — browser code under jsdom, still Node. One runtime, no browser-vs-node context problem.
- **Programmatic runs:** `runStory("checkout")` is a thin wrapper over vitest's programmatic API filtered to the story's file, returning pass/fail + artifact.

### Setup is untraced

Recording is **on only inside a path body.** Setup, beforeEach, fixtures, module init — the tracer is off. Blocks executed during setup contribute nothing: no coverage, no shape.

_Why:_ setup is preparation, not narrative. What happens in setup is none of the story's business. Single-threaded execution makes this a flag flip around the path invocation. Accepted cost: a decision touched only by setup is invisible to the story — it wasn't part of the story anyway.

### The artifact

The reporter merges all paths of a story into **one JSON artifact per story**: the flow graph, visited/unvisited arms, per-path attribute values, block locations. Test result + artifact, from one run.

### Production mode

Block behavior is pluggable: **`noop | log | emit(fn)`**. Default in production: noop.

With `log`, each block emits one structured JSON line — `{ story?, block, arm?, attrs, ts }`. The story artifact from tests is the _map_; production logs are _breadcrumbs on the map_. Replaying "what actually ran in prod" against the story graph is a viewer feature, not a runtime feature. Deferred — but the log-line format is designed **now** so v1 blocks never need changing.

---

## The Unifying Principle

Every pillar has the same shape:

> **Static truth + runtime evidence, merged. Declared intent + actual state, both visible.**

- Layers/modules: config (intent) merged with the extracted import graph (reality) → violations + viz.
- Stories: declared arms (shape) merged with traced execution (reality) → flow graph + gaps.
- Production, later: story graph (map) merged with logs (reality) → replay.

One config. One engine. Enforcement and the diagram are the same artifact.

---

## Package Layout

One package, five subpaths — consumers only pay for what they import:

| Subpath               | Contents                                                       | Runs where               |
| --------------------- | -------------------------------------------------------------- | ------------------------ |
| `laymos`              | Config DSL + types                                             | Anywhere (browser-safe)  |
| `laymos/node`         | `analyzeProject` engine (Effect)                               | Node, dev-time           |
| `laymos/story`        | `storyFn`, `step`, `decision`, `configureStory` — zero-dep     | Production               |
| `laymos/story/effect` | `yield*` companions (peer: `effect`)                           | Production (Effect apps) |
| `laymos/vitest`       | `story`, `path`, preset, reporter, `runStory` (peer: `vitest`) | Test-time                |

```
src/
├─ config/     builders: layer, edge, layerGraph, module, rules, defineConfig
├─ engine/     extract (skott) → resolve → evaluate → emit, tagged errors
├─ cli/        effect CLI: laymos lint
├─ story/
│  ├─ core/      zero-dep primitives + internal serial tracer
│  ├─ effect/    Effect companions
│  └─ artifact/  StoryArtifact + LogLine formats
├─ vitest/     story, path, preset, reporter
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
| **Effect** for the engine, CLI, reporter                     | Consistent with this repo; devtools (the programmatic consumer) is Effect-native. `laymos/story` core stays zero-dep (ADR-0002).                      |
| **`laymos.config.ts`** single typed file, reference builders | One source of truth; cross-references are values — autocomplete, rename-safe. Cost: config is executed code.                                          |
| **Vitest** as story substrate                                | Fixtures/mocks/transforms already solved; preset + reporter instead of a runner.                                                                      |
| **Serial per file, parallel across files**                   | Trace correctness without AsyncLocalStorage; parallelism from vitest's process model.                                                                 |
| **`Error().stack`** for block location                       | Zero build-step; start line is good enough.                                                                                                           |
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
