# kui-toolkit

React components, blocks, forms, hooks, and styles for Vite and TanStack Start.

## Big picture

Apps in this monorepo share one look and one set of interactive blocks. This
Package holds them so each app does not rebuild buttons, dialogs, trace
viewers, or architecture graphs on its own. It ships TypeScript and TSX source,
not a compiled bundle. The consuming app's Vite build compiles it, so
Tailwind classes, theme tokens, and React are resolved once, in the app.

Three layers live here. `components/ui` is the shadcn primitive set on Base
UI. `components/blocks` are larger pieces built on those primitives: auth
screens, ER and flow diagrams, the OpenTelemetry trace viewer, the Laymos and
Monoverse explorers, JSON and source viewers. `form`, `hooks`, `lib`, and
`styles` are the glue: a TanStack Form hook, a few DOM hooks, class helpers,
and the Tailwind theme.

Blocks that read data from sibling Packages take that data as props or as an
Effect loader. `er-diagram` and `std-toolkit-studio` read `std-toolkit`
snapshots and RPC clients. `flow-swimlane` and `devtools-panel` read
`@pkishorez/flow` and `@pkishorez/effect-tracer`. `otel-trace-viewer` reads
`@pkishorez/lotel` records. `laymos` and `monoverse` read `laymos` analyses.
`apps/docs`, `apps/alchemy-console`, and `devtools/devtools` consume this
Package.

Domain terms for the Studio block are in [CONTEXT.md](./CONTEXT.md).

## Install

```sh
pnpm add kui-toolkit react react-dom
pnpm add -D tailwindcss @tailwindcss/vite
```

Add `kui-toolkit` to `ssr.noExternal` in the app's Vite config when the app
renders on the server (TanStack Start). Client-only Vite apps skip that. Use
`moduleResolution: "bundler"` and `jsx: "react-jsx"` in `tsconfig.json`; the
app type-checks this source, so `skipLibCheck` does not apply to it.

Peer dependencies:

- `react`, `react-dom`: every component renders with React 19.
- `@pkishorez/flow` (optional): flow projection types for `flow-swimlane` and `devtools-panel`.
- `@pkishorez/effect-tracer` (optional): trace recorder types for `devtools-panel`.
- `@pkishorez/lotel` (optional): stored span and log record types for `otel-trace-viewer`.
- `std-toolkit` (optional): table snapshot and Studio RPC client types for `er-diagram` and `std-toolkit-studio`.
- `laymos` (optional): analysis and diff types for `laymos`, `monoverse`, and `diff-viewer`.
- `effect` (optional): `laymos`, `monoverse`, `std-toolkit-studio`, `flow-swimlane`, and `devtools-panel` run Effect programs or read Effect types.
- `use-effect-ts` (optional): runs the Effect loaders of `laymos`, `monoverse`, and `std-toolkit-studio` inside React.
- `zustand` (optional): persisted settings store for the `auth` screens.
- `@tanstack/react-query`, `@tanstack/react-db` (optional): declared so consumers dedupe one copy; the toolkit does not import them directly.

## Exports

Import individual subpaths. There is no root barrel.

### `kui-toolkit/components/blocks/auth`

Account and OAuth screens for the auth-toolkit server. Each takes a `branding`
object and a state union, and renders loading, error, and ready states.

| Export           | What it does                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `LoginScreen`    | Renders the sign-in screen with a continue button and an optional error.                                        |
| `HomeScreen`     | Shows the signed-in user, their sessions, and their grants, with sign-out, revoke, and re-authenticate actions. |
| `ConsentScreen`  | Asks the user to approve or deny a client's requested scopes.                                                   |
| `DeviceScreen`   | Walks through device-code login: enter a code, confirm the client, then show the result.                        |
| `NotFoundScreen` | Renders a branded page-not-found message with a link home.                                                      |
| `ErrorScreen`    | Renders a branded error page with an optional error code and description.                                       |

### `kui-toolkit/components/blocks/er-diagram`

| Export      | What it does                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `ERDiagram` | Draws an Entity Relationship diagram from a `std-toolkit` table snapshot, with field detail popovers. |

### `kui-toolkit/components/blocks/flow-swimlane`

| Export              | What it does                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `FlowSwimlane`      | Renders a recorded Flow projection as an interactive hierarchical swim lane with controlled selection. |
| `FlowItemDetails`   | Shows one selected flow item's details.                                                                |
| `getFlowSummaryIds` | Returns the stable IDs of collapsible consecutive-step groups in a flow.                               |

### `kui-toolkit/components/blocks/laymos`

Views over a Laymos `ArchitectureAnalysis`. `Laymos` composes the rest.

| Export                 | What it does                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `Laymos`               | Full architecture explorer: layers, modules, violations, source, git changes, and stories. |
| `LayerGraph`           | Draws one layer graph with its rules and highlights the active violation pair.             |
| `LayerDetails`         | Shows the details of one layer.                                                            |
| `LayerScopeTree`       | Lists layers as a tree scoped to one layer graph.                                          |
| `LayerViolationsList`  | Lists layer rule violations and reports which pair is active.                              |
| `ModuleGraph`          | Draws the module dependency graph, optionally focused on one layer.                        |
| `ModuleTree`           | Lists modules grouped by layer with highlight and activation callbacks.                    |
| `ModuleViolationsList` | Lists module visibility violations and reports which one is active.                        |
| `ModuleLegend`         | Explains the markers used in the module graph.                                             |
| `ArchitectureSnapshot` | Draws a still module graph of the changed modules, sized to its content, for a screenshot. |

### `kui-toolkit/components/blocks/monoverse`

| Export            | What it does                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Monoverse`       | Explores a monorepo's Packages and dependencies from an Effect loader, and can open an embedded Laymos per Package. |
| `MonoverseHeader` | Header with dependency-kind filters for the Monoverse canvas.                                                       |

### `kui-toolkit/components/blocks/otel-trace-viewer`

| Export               | What it does                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| `TraceViewer`        | Renders spans from one or more traces as a trace list, waterfall, and span inspector. |
| `TraceList`          | Table of traces with resizable columns.                                               |
| `NewTracesRow`       | Table row that announces buffered newer traces and reveals them on click.             |
| `TraceDock`          | Docked panel for one trace with controlled height, sidebar, and selected span.        |
| `JsonTree`           | Collapsible JSON tree, the same component as in the `json` block.                     |
| `serviceColor`       | Picks a stable set of background, text, and dot classes for a service name.           |
| `groupByTrace`       | Groups spans by trace ID and derives each trace's status.                             |
| `attachLogs`         | Appends log events to one span.                                                       |
| `attachCapturedLogs` | Folds recorder logs into their spans' events and drops logs with no span.             |
| `transformSpan`      | Converts a stored span record into the viewer's span shape.                           |
| `transformLog`       | Converts a stored log record into the viewer's event shape.                           |

### `kui-toolkit/components/blocks/std-toolkit-studio`

| Export             | What it does                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `StdToolkitStudio` | Read-only inspector for one remote StdTable driven by a Studio RPC client, with Diagram and Query views. |

### `kui-toolkit/components/blocks/*`

Resolves to `src/components/blocks/<name>/index.ts`. Blocks below are reached
this way.

#### `devtools-panel`

| Export          | What it does                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `DevToolsPanel` | Controlled panel that shows recorded Traces and Flows live, with a tab per Trace and a chip per Flow. |

#### `diff-viewer`

| Export       | What it does                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| `DiffViewer` | Renders one file's diff in split or unified layout with wrap and pane toggles. |

#### `file-tree`

| Export          | What it does                                                                |
| --------------- | --------------------------------------------------------------------------- |
| `FileTree`      | Controlled tree of file paths with highlight, dim, click, and suffix hooks. |
| `expandAll`     | Returns every folder path so the whole tree is open.                        |
| `expandToDepth` | Returns folder paths up to a depth.                                         |
| `expandTo`      | Returns the folder paths needed to reveal one path.                         |
| `toggleSubtree` | Opens or closes a folder and all of its descendants.                        |

#### `json`

| Export       | What it does                                                    |
| ------------ | --------------------------------------------------------------- |
| `JsonEditor` | Controlled JSON editor backed by CodeMirror.                    |
| `JsonTree`   | Collapsible JSON tree with compact and roomy sizes.             |
| `JsonViewer` | Read-only JSON view with a copy button and optional max height. |

#### `markdown-viewer`

| Export           | What it does                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `MarkdownViewer` | Renders a Markdown string with GFM support and highlights fenced code through `SourceViewer`. |

#### `sequence`

Step-based animations for blog posts. The long-form guide is
[src/components/blocks/sequence/README.md](./src/components/blocks/sequence/README.md).

| Export            | What it does                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `step`            | Defines one frame from a name, its default props, and a render function.                    |
| `useSteps`        | Builds the controller that tracks the active step and moves forward, back, or to the start. |
| `Screen`          | Renders the active step of a controller inside a sized canvas at a given speed.             |
| `StepNav`         | Prebuilt Prev, Restart, and Next bar bound to a controller.                                 |
| `Div`             | A motion-enabled div that inherits the Screen's animation duration.                         |
| `Present`         | Mounts and unmounts children with enter and exit presets.                                   |
| `enter`           | Enter presets: the initial and animate pair an element mounts with.                         |
| `exit`            | Exit presets: the variant an element leaves with.                                           |
| `loop`            | Builds a repeating transition of a given duration.                                          |
| `stagger`         | Builds a delay for the i-th element of a group.                                             |
| `motion`          | Re-export of `motion/react`'s `motion`.                                                     |
| `AnimatePresence` | Re-export of `motion/react`'s `AnimatePresence`.                                            |

#### `source-viewer`

| Export         | What it does                                                                           |
| -------------- | -------------------------------------------------------------------------------------- |
| `SourceViewer` | Highlights a source file with Shiki and marks ranges, sections, and per-line statuses. |

#### `state-machine-visualizer`

| Export               | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `StateMachineViewer` | Interactive pan-and-zoom viewer for a laid-out state machine with focus and follow modes. |
| `StateMachineSvg`    | The static SVG of a laid-out state machine, for custom viewports and highlights.          |
| `layoutStateMachine` | Lays out a serialized machine with ELK and returns node and edge positions.               |
| `serializeV5`        | Converts an XState v5 machine into the serialized shape.                                  |
| `serializeV6`        | Converts an XState v6 machine into the serialized shape.                                  |

#### `swim-lane`

| Export     | What it does                                                          |
| ---------- | --------------------------------------------------------------------- |
| `SwimLane` | Data-driven sequence diagram with evenly spaced actor lanes and zoom. |

### `kui-toolkit/components/*`

Resolves to `src/components/<path>.tsx`. In practice this is the shadcn
primitive set under `components/ui/*`, one file per component. Each file
exports the component and its parts (for example `Dialog`, `DialogContent`,
`DialogTitle`). `components/blocks/hello` also resolves here to a `Hello`
sample card.

| File                  | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `ui/accordion`        | Expandable sections.                                             |
| `ui/alert`            | Inline notice with title, description, and action.               |
| `ui/alert-dialog`     | Modal that asks for confirmation.                                |
| `ui/aspect-ratio`     | Box that keeps a width-to-height ratio.                          |
| `ui/attachment`       | File attachment chips for chat and upload UIs.                   |
| `ui/avatar`           | User image with fallback, group, and badge.                      |
| `ui/badge`            | Small status label with variants.                                |
| `ui/breadcrumb`       | Path navigation.                                                 |
| `ui/bubble`           | Chat message bubbles with reactions.                             |
| `ui/button`           | Button with size and variant classes.                            |
| `ui/button-group`     | Joined row of buttons.                                           |
| `ui/calendar`         | Date picker calendar on react-day-picker.                        |
| `ui/card`             | Bordered surface with header, content, and footer.               |
| `ui/carousel`         | Embla-based slider.                                              |
| `ui/chart`            | Recharts container, tooltip, and legend wrappers.                |
| `ui/checkbox`         | Checkbox input.                                                  |
| `ui/collapsible`      | Show-and-hide region.                                            |
| `ui/combobox`         | Searchable select with chips and groups.                         |
| `ui/command`          | Command palette on cmdk.                                         |
| `ui/context-menu`     | Right-click menu.                                                |
| `ui/dialog`           | Modal dialog.                                                    |
| `ui/direction`        | Text direction provider and hook from Base UI.                   |
| `ui/drawer`           | Bottom sheet on vaul.                                            |
| `ui/dropdown-menu`    | Button-triggered menu.                                           |
| `ui/empty`            | Empty state with media, title, and description.                  |
| `ui/field`            | Form field layout: label, description, error, group, set.        |
| `ui/file-tree`        | Tree, Folder, File, and collapse button primitives.              |
| `ui/google-button`    | Sign in with Google button.                                      |
| `ui/hover-card`       | Popover that opens on hover.                                     |
| `ui/input`            | Text input.                                                      |
| `ui/input-group`      | Input with addons, buttons, and inline text.                     |
| `ui/input-otp`        | One-time code input slots.                                       |
| `ui/item`             | List item with media, content, and actions.                      |
| `ui/kbd`              | Keyboard key label.                                              |
| `ui/label`            | Form label.                                                      |
| `ui/marker`           | Icon marker with variants.                                       |
| `ui/menubar`          | Horizontal menu bar.                                             |
| `ui/message`          | Chat message with avatar, header, and footer.                    |
| `ui/message-scroller` | Scroll container that sticks to the bottom for message lists.    |
| `ui/native-select`    | Styled native `<select>`.                                        |
| `ui/navigation-menu`  | Site navigation with positioned content.                         |
| `ui/pagination`       | Page links.                                                      |
| `ui/popover`          | Anchored floating panel.                                         |
| `ui/progress`         | Progress bar with label and value.                               |
| `ui/questionnaire`    | Multi-step question flow with choices, progress, and navigation. |
| `ui/radio-group`      | Radio inputs.                                                    |
| `ui/resizable`        | Resizable panel group.                                           |
| `ui/scroll-area`      | Custom scrollbar container.                                      |
| `ui/select`           | Dropdown select.                                                 |
| `ui/separator`        | Divider line.                                                    |
| `ui/sheet`            | Side panel dialog.                                               |
| `ui/sidebar`          | App sidebar with provider, menus, and rail.                      |
| `ui/skeleton`         | Loading placeholder.                                             |
| `ui/slider`           | Range slider.                                                    |
| `ui/sonner`           | `Toaster` and `toast` from sonner.                               |
| `ui/spinner`          | Loading spinner.                                                 |
| `ui/switch`           | Toggle switch.                                                   |
| `ui/table`            | Table parts.                                                     |
| `ui/tabs`             | Tab list and content.                                            |
| `ui/textarea`         | Multi-line input.                                                |
| `ui/toast`            | Base UI toast manager, provider, and parts.                      |
| `ui/toggle`           | Pressable toggle button.                                         |
| `ui/toggle-group`     | Group of toggles.                                                |
| `ui/tooltip`          | Hover label.                                                     |

### `kui-toolkit/lib/shadow-dom`

| Export           | What it does                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `ShadowScope`    | Renders children inside an open shadow root with the given CSS string and a theme attribute. |
| `useShadowScope` | Returns the shadow root, portal container, and theme from the nearest `ShadowScope`.         |

### `kui-toolkit/lib/*`

Resolves to `src/lib/<name>.ts`.

| Export                               | What it does                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `lib/utils` `cn`                     | Merges class names with clsx and tailwind-merge.                                  |
| `lib/scrollStyles` `scrollbarStyles` | Class string for a thin custom scrollbar on fine-pointer devices.                 |
| `lib/scrollStyles` `scrollBar`       | Builds scrollbar classes for a default, small, or hidden variant and a direction. |
| `lib/lucide`                         | Same as `kui-toolkit/lucide`.                                                     |
| `lib/motion`                         | Same as `kui-toolkit/motion`.                                                     |

### `kui-toolkit/hooks/*`

| Export                                      | What it does                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `hooks/use-element-width` `useElementWidth` | Returns a ref and the element's content width tracked by ResizeObserver.                       |
| `hooks/use-mobile` `useIsMobile`            | Returns true below the 768px breakpoint and updates on resize.                                 |
| `hooks/use-scroll` `useScroll`              | Keeps a container pinned to the bottom while content grows and exposes smooth scroll controls. |

### `kui-toolkit/utils`

| Export | What it does                                     |
| ------ | ------------------------------------------------ |
| `cn`   | Merges class names with clsx and tailwind-merge. |

### `kui-toolkit/lucide`

| Export | What it does                                                                   |
| ------ | ------------------------------------------------------------------------------ |
| `*`    | Re-exports every icon from `lucide-react` so apps import icons from one place. |

### `kui-toolkit/motion`

| Export | What it does                                                           |
| ------ | ---------------------------------------------------------------------- |
| `*`    | Re-exports `motion/react` (`motion`, `AnimatePresence`, and the rest). |

### `kui-toolkit/form`

| Export        | What it does                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useAppForm`  | TanStack Form hook with `TextField`, `TextareaField`, `SelectField`, `SwitchField`, `DatePickerField`, and `SubmitButton` registered. |
| `withForm`    | Wraps a component so it receives a form created by `useAppForm`.                                                                      |
| `formOptions` | Re-export of TanStack Form's `formOptions` for shared form config.                                                                    |

### `kui-toolkit/styles/*`

- `global.css`: Tailwind, tw-animate-css, shadcn base, dark variant, and every file below. Import this in a fresh app.
- `sources.css`: `@source` entries so Tailwind scans the toolkit's classes from `node_modules`.
- `theme.css`: color, radius, and font tokens for light and dark.
- `typography.css`: the Tailwind typography plugin.
- `shiki.css`: dual-theme token colors and diff line decorations for code blocks.
- `font-inter.css`: Inter Variable and JetBrains Mono Variable from fontsource. Optional.

## Usage

### Install the stylesheet and show JSON in a dialog

`apps/alchemy-console` imports the global stylesheet once, then composes UI
primitives with the `json` block.

```css
/* src/styles.css */
@import 'kui-toolkit/styles/global.css';
@import 'kui-toolkit/styles/font-inter.css';

@source './';

:root {
  --radius: 0.5rem;
}
```

```tsx
import { useState } from 'react';
import { JsonViewer } from 'kui-toolkit/components/blocks/json';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { Braces } from 'kui-toolkit/lucide';

export function JsonButton({
  title,
  value,
  label,
}: {
  title: string;
  value: unknown;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <Braces />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{title}</DialogTitle>
            <DialogDescription>Masked JSON.</DialogDescription>
          </DialogHeader>
          <JsonViewer value={value} label="JSON" maxHeight="65dvh" />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

How it works:

- `global.css` pulls in Tailwind, the theme tokens, and `sources.css`, so toolkit classes compile without a manual `@source` into `node_modules`.
- The app's own `@source './'` registers its files; `--radius` overrides one token.
- The root route links the stylesheet with `import appCss from '../styles.css?url'`.
- `Dialog` is controlled through `open` and `onOpenChange`; `JsonViewer` scrolls inside `maxHeight`.

### Embed the Monoverse block with an Effect loader

`devtools/devtools` hands the block an Effect that fetches the analysis over
RPC, and keeps the selected Package in the URL.

```tsx
import { useCallback } from 'react';
import { Effect } from 'effect';
import { Monoverse as MonorepoExplorer } from 'kui-toolkit/components/blocks/monoverse';
import { LaymosProjectWorkspace } from '../../laymos/project-workspace/index.js';
import {
  DevtoolsClient,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';

// The block wants an Effect-returning loader, so run against the runtime's
// already-built context instead of round-tripping through a Promise.
function provideRuntime<A, E>(
  runtime: DevtoolsRuntime,
  effect: Effect.Effect<A, E, DevtoolsClient>,
): Effect.Effect<A, E, never> {
  return Effect.flatMap(runtime.contextEffect, (context) =>
    Effect.provide(effect, context),
  );
}

function MonorepoView({
  runtime,
  monorepoPath,
  reloadNonce,
  search,
  setSearch,
}: Props) {
  const loadAnalysis = useCallback(
    () =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeMonorepo({ monorepoPath });
        }).pipe(
          // Transport failures carry structured reasons; the block wants text.
          Effect.mapError((error) =>
            error._tag === 'RpcClientError'
              ? { _tag: error._tag, message: error.message }
              : error,
          ),
        ),
      ),
    [runtime, monorepoPath, reloadNonce],
  );

  return (
    <MonorepoExplorer
      monorepoPath={monorepoPath}
      loadAnalysis={loadAnalysis}
      reloadNonce={reloadNonce}
      renderLaymos={({ projectPath }) => (
        <LaymosProjectWorkspace
          projectPath={projectPath}
          reloadNonce={reloadNonce}
        />
      )}
      selectedPackage={search.package ?? null}
      onSelectedPackageChange={(name) =>
        setSearch({ package: name ?? undefined })
      }
      openPackage={search.laymos ?? null}
      onOpenPackageChange={(name) => setSearch({ laymos: name ?? undefined })}
      className="h-full"
    />
  );
}
```

How it works:

- `loadAnalysis` returns `Effect<MonorepoAnalysis, MonoverseLoadError>`; the block runs it and shows loading and failure states itself.
- Errors must carry `_tag` and an optional `message`, so transport errors are mapped to that shape.
- Bumping `reloadNonce` re-runs the loader.
- `selectedPackage` and `openPackage` are controlled; leave them out for local state.
- `renderLaymos` receives the Package's path and returns the embedded Laymos view.

### Build a form with `useAppForm`

Adapted from the example in `src/form/index.ts`. Validation accepts any
Standard Schema library.

```tsx
import { useAppForm } from 'kui-toolkit/form';
import { z } from 'zod';

export function ContactForm() {
  const form = useAppForm({
    defaultValues: { email: '', message: '' },
    validators: {
      onChange: z.object({
        email: z.string().email(),
        message: z.string().min(10),
      }),
    },
    onSubmit: async ({ value }) => {
      console.log(value);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.AppField
        name="email"
        children={(field) => (
          <field.TextField label="Email" type="email" required />
        )}
      />
      <form.AppField
        name="message"
        children={(field) => <field.TextareaField label="Message" required />}
      />
      <form.AppForm>
        <form.SubmitButton>Send</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}
```

How it works:

- `useAppForm` is `createFormHook` from TanStack Form with the toolkit's fields and submit button registered.
- `form.AppField` binds a field by name; the render callback gets `field.TextField`, `field.TextareaField`, `field.SelectField`, `field.SwitchField`, and `field.DatePickerField`.
- `form.AppForm` provides form context so `form.SubmitButton` can read submitting and validity state.
- Field errors from the schema render under each field automatically.
