# Laymos Stories

`LaymosStories` presents the implementation narrative for generated Laymos
Stories. It is an opinionated, controlled visualization block backed by a
`StoryCollection` and `StoriesRun` from `laymos/report`; it is not a graph
toolkit or an artifact loader.

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
  | { readonly kind: 'group'; readonly groupPath: StoryGroupPath }
  | { readonly kind: 'story'; readonly storyId: StoryId }
  | {
      readonly kind: 'scenario';
      readonly storyId: StoryId;
      readonly scenarioIndex: number;
    }
  | null;

interface LaymosStoriesProps {
  readonly collection: StoryCollection;
  readonly runs: StoriesRun;
  readonly runState:
    | { readonly kind: 'group'; readonly groupPath: StoryGroupPath }
    | { readonly kind: 'story'; readonly storyId: StoryId }
    | { readonly kind: 'all' }
    | null;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunStory?: (storyId: StoryId) => void;
  readonly onRunGroup?: (groupPath: StoryGroupPath) => void;
  readonly onRunAll?: () => void;
  readonly sidebarExpansion?: 'single' | 'recursive';
  readonly showNavigator?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
}
```

The consumer discovers a Story catalog, starts with an empty report, and adds fresh
artifacts returned by focused runs. A complete run replaces the entire report.
`LaymosStories` performs no fetching or filesystem access: it receives the
catalog, caller-held report, active run state, and execution callbacks.

On initial load, the navigator opens every top-level Group, then follows the
first Group branch until its first Stories are visible. After that it keeps
only the active branch open.
Selecting a Group reveals its immediate children while nested Groups remain
collapsed. Scenario lists are collapsed by default; selecting a Story opens
only that Story's Scenarios and shows their count on its row. Selecting the
same open Group or Story again collapses it. Set
`sidebarExpansion="recursive"` to open the selected Group's complete subtree.
The navigator is included by default. Set `showNavigator={false}` when a parent
composition supplies its own navigation surface.
Stories and their Scenarios are nested beneath each Group:

```text
Commerce
└─ Checkout
   ├─ Place an order
   │  ├─ Happy path
   │  └─ Fraud rejected
   └─ Refund an order
```

Groups are selectable destinations with descriptions, immediate child Groups,
direct Stories, descendant counts, execution summaries, and a **Run group**
action covering their complete subtree. If the catalog has Groups, direct
`story()` declarations appear in a distinct **Standalone stories** section. If
it has no Groups, Stories retain the original flat presentation. Groups sort
before Stories and siblings sort alphabetically.

The **All stories** header returns to the collection overview. When `onRunAll`
is supplied, a fixed sidebar footer exposes **Run all stories**. Overview rows
and Story views expose Play or Refresh when `onRunStory` is supplied. Any active
`runState` disables the other execution controls. Existing evidence remains
visible during refresh and is replaced when the consumer supplies the result.
The wrapper owns operational errors and report replacement.

An empty catalog presents **“No Story files found.”** Catalog Stories without
report entries remain visible as **“Not run”** and can be selected or executed.
This keeps “nothing discovered” distinct from “not executed yet.”

- `null` selection shows the Story collection overview.
- Selecting a Group shows its Group overview.
- Selecting a Story shows its unified Story view and its Scenario list.
- Selecting a Scenario replaces the canvas with that Scenario view.
- Selecting the current Story returns to its unified view.
- The navigator remains visible at every level.
- Skipped Scenarios remain visible but have no Block Visits.

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
Every Flow is inlined as a scoped background. The outermost Flow is transparent;
nested Flows use an intentionally faint neutral tint so their boundaries remain
visible in either color scheme without competing with their contents. All
operation nodes remain above every scope background during hover and selection.
Scopes containing only one visible operation are omitted. Right-clicking a Flow
background delegates collapse to its entry operation, so collapse and expansion
always use ordinary node behavior. A scope disappears while its entry is the only
visible operation.

Expanded Flow backgrounds do not participate in execution edges. An edge enters
the first executable node inside a called Flow directly, and that node receives
a neutral start outline. Nested Flow-only prefixes are skipped until the first
executable node is reached. Collapse remains attached to executable nodes; Flow
wrappers disappear when only the collapsed entry remains visible.

The `showFunctionScopes` canvas preference removes every Flow wrapper, title,
and start marker. The remaining graph is a plain executable control flow; edges
through atomic Flow calls are joined to their next executable node.
Canvas controls start minimized and expand only from the top-right controls
button.

For each non-skipped Scenario, the block flattens its Execution Path into one
scoped execution graph, replaces each Block Visit with its Block ID and direct
caller, and unions the result with every other Scenario:

- identical Blocks under the same direct caller merge;
- shared Blocks called by different parents remain separate contextual nodes;
- repeated Blocks merge without adding edges that would create overview cycles;
- divergent paths remain as branches;
- unrelated paths remain as disconnected components;
- failed and interrupted Scenarios contribute identically to successful ones;
- divergence is evidence, never a warning or violation.

Containment is shown through nested Flow backgrounds. Hovering a Block previews
its incident edges;
clicking a Block keeps its connections active and dims every unrelated node and
edge. Hovering a connected Block within that selection temporarily emphasizes
the shared edge. A shared Block observed under several parents keeps every
observed disclosure relationship.

Edges have three visual states: neutral gray edges provide quiet graph context,
blue highlighted edges identify the active connection, and dimmed edges sit
outside the active scope. The final edge into a Terminal adopts its completion
color. When a connected Block is hovered inside a selection, the selected
Block's other edges return to default while the shared edge is highlighted;
edges outside the selection remain dimmed.

The details card avoids repeating Decision Arms already shown on the node. It
adds incoming, outgoing, and contained-Block counts plus the contained names,
and the entire card toggles between its expanded and minimized states.

A Decision shows one chip per declared Arm. Observed Arms are highlighted and
unobserved Arms render muted, without implying incomplete coverage.

A Terminal closes only its local sequential branch. It uses one strong endpoint
card and no outgoing handle: emerald for success, rose for a documented error,
and slate when completion is unspecified. The icon and endpoint shape carry the
meaning without a repeated status badge; a documented error name appears as
secondary content. Narrative rows stop their rail with the same colored
end-cap. Runtime mismatch and Scenario failure styling remains separate and
uses destructive red.

## Scenario view

Scenario view defaults to the same document presentation and may be switched to
Graph. It preserves every Visit rather than folding by Block identity:

- every Block Visit gets its own node, identified by its structural position;
- repeated and recursive Blocks remain duplicated;
- array order provides sequential flow;
- parallel branches render as fork/join flow;
- Flow containment uses the same inline scoped backgrounds as Story Graph;
- the selected Decision Arm is visible; a Decision Visit without one ended
  before choosing and renders as such;
- failed and interrupted partial execution remains visible.
- a failed Visit in a successful Scenario is labelled as an expected failure;
  red failure styling is reserved for a Scenario that actually failed.

Dynamic attributes are Visit-only. Story view never merges, summarizes, or
displays their values.

## View-model ownership

The raw report is the source of truth. Story and Scenario projections are
derived inside this block. No first Visit becomes canonical, and no derived
React Flow node, edge, layout coordinate, or interaction state is written back
to the report.
