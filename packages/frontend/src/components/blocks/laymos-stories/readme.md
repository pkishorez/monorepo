# Laymos Stories

`LaymosStories` presents the implementation narrative for generated Laymos
Stories. It is an opinionated, controlled visualization block backed by one
`LaymosStoriesReport` from `laymos/report`; it is not a graph toolkit or an
artifact loader.

The default presentation is an expandable story outline. Shared Blocks appear
once, linear work follows one quiet vertical rail, and Decisions disclose
nested Arm branches without turning the narrative into a numbered timeline.
The existing node graph remains available through the **Graph** view toggle.

## Data boundary

The report contains Story artifacts keyed by Story ID. Each Story owns shared
Block definitions and Scenarios. Each Scenario owns one recursive Execution
Path that directly holds its Block Visits:

- array order means sequential execution;
- `parallel` branches mean concurrent execution;
- a Visit item's `children` path means containment;
- a Visit item carries its Block ID, outcome, selected Decision Arm, and
  optional attributes, but no identifier of its own and no parent, next, or
  edge fields — a visit is identified by its position in the path.

The block privately derives React Flow nodes, execution-flow edges, hover
disclosure relationships, and layout. None of those view-model types cross the
public API.

## Controlled navigation

The block uses one persistent navigation hierarchy. Story and Scenario
selections share a **Narrative / Graph** presentation toggle rather than using
separate tabs.

```ts
type LaymosStoriesSelection =
  | { readonly kind: 'story'; readonly storyId: StoryId }
  | {
      readonly kind: 'scenario';
      readonly storyId: StoryId;
      readonly scenarioIndex: number;
    }
  | null;

interface LaymosStoriesProps {
  readonly storyIds: readonly StoryId[];
  readonly report: LaymosStoriesReport;
  readonly runState:
    | { readonly kind: 'story'; readonly storyId: StoryId }
    | { readonly kind: 'all' }
    | null;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunStory?: (storyId: StoryId) => void;
  readonly onRunAll?: () => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}
```

The consumer discovers Story IDs, starts with an empty report, and adds fresh
artifacts returned by focused runs. A complete run replaces the entire report.
`LaymosStories` performs no fetching or filesystem access: it receives the
discovered IDs, caller-held report, active run state, and execution callbacks.

The navigator lists every Story and nests its Scenarios beneath it:

```text
Stories
├─ Checkout
│  ├─ Happy path
│  ├─ Fraud rejected
│  └─ Payment failed
└─ Refund
   ├─ Within window
   └─ Window expired
```

The **All stories** header returns to the collection overview. When `onRunAll`
is supplied, a fixed sidebar footer exposes **Run all stories**. Overview rows
and Story views expose Play or Refresh when `onRunStory` is supplied. Any active
`runState` disables the other execution controls. Existing evidence remains
visible during refresh and is replaced when the consumer supplies the result.
The wrapper owns operational errors and report replacement.

An empty `storyIds` list presents **“No Story files found.”** Discovered IDs
without report entries remain visible as **“Not run”** and can be selected or
executed. This keeps “nothing discovered” distinct from “not executed yet.”

- `null` selection shows the Story collection overview.
- Selecting a Story shows its unified Story view and its Scenario list.
- Selecting a Scenario replaces the canvas with that Scenario view.
- Selecting the current Story returns to its unified view.
- The navigator remains visible at every level.
- Duplicate Story display names use their project-relative Story IDs as
  secondary labels.
- Skipped Scenarios remain visible but have no Block Visits.

Cross-Story categorization and relationship visualization are deferred.

## Story view

Story view explains how the feature or use case is implemented in general. It
contains no Scenario names, outcomes, attributes, Visit counts, or
Scenario-specific highlighting.

Narrative is the default. It projects the unified flow as a progressively
disclosed tree:

- ordinary execution follows one vertical rail without numbers or step cards;
- a Block row expands its description and a Decision expands its declared Arms;
- every Arm expands independently, so readers may inspect and compare several
  routes without one selection replacing another;
- nested Decisions remain inside their parent Arm and increase indentation;
- converged and cyclic flow becomes a compact reference to the canonical Block
  instead of duplicating its entire subtree;
- multiple outgoing paths are introduced conversationally as work that happens
  together and converge before their shared continuation;
- names and descriptions carry the narrative without cards, source metadata,
  technical badges, or global tree controls;
- color remains limited to decision and Scenario outcome cues;
- a Scenario expands its observed route by default and retains unfollowed Arms
  as muted collapsed siblings;
- runtime evidence never competes with the implementation explanation.

The Graph view preserves the spatial node-and-edge projection described below.

For each non-skipped Scenario, the block flattens its Execution Path into one
execution flow — a parent Block flows into its first contained children, and a
contained sequence flows onward to whatever ran next — replaces each Block
Visit with its Block ID, and unions the result with every other Scenario:

- identical Blocks and execution-flow edges merge;
- repeated Blocks may produce self-loops or cycles;
- divergent paths remain as branches;
- unrelated paths remain as disconnected components;
- failed and interrupted Scenarios contribute identically to successful ones;
- divergence is evidence, never a warning or violation.

Containment is not drawn as persistent edges or nested boxes. Hovering a Block
previews its incident edges and discloses its directly contained children;
clicking a Block keeps its connections active and dims every unrelated node and
edge. Hovering a connected Block within that selection temporarily emphasizes
the shared edge. A shared Block observed under several parents keeps every
observed disclosure relationship.

Edges have three visual states: default edges provide quiet graph context,
highlighted edges identify the active connection, and dimmed edges sit outside
the active scope. When a connected Block is hovered inside a selection, the
selected Block's other edges return to default while the shared edge is
highlighted; edges outside the selection remain dimmed.

The details card avoids repeating Decision Arms already shown on the node. It
adds incoming, outgoing, and contained-Block counts plus the contained names,
and the entire card toggles between its expanded and minimized states.

A Decision shows one chip per declared Arm. Observed Arms are highlighted and
unobserved Arms render muted, without implying incomplete coverage.

## Scenario view

Scenario view defaults to the same document presentation and may be switched to
Graph. It preserves every Visit rather than folding by Block identity:

- every Block Visit gets its own node, identified by its structural position;
- repeated and recursive Blocks remain duplicated;
- array order provides sequential flow;
- parallel branches render as fork/join flow;
- containment is disclosed on hover, not drawn as nesting;
- the selected Decision Arm is visible; a Decision Visit without one ended
  before choosing and renders as such;
- failed and interrupted partial execution remains visible.

Dynamic attributes are Visit-only. Story view never merges, summarizes, or
displays their values.

## View-model ownership

The raw report is the source of truth. Story and Scenario projections are
derived inside this block. No first Visit becomes canonical, and no derived
React Flow node, edge, layout coordinate, or interaction state is written back
to the report.
