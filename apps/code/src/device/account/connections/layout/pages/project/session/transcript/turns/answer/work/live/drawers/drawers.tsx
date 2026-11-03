import { type ReactNode, useRef } from 'react';
import { useDevice } from '@kestack/web-platform/ui/input';
import {
  Dialog,
  DialogContent,
} from '@kestack/web-platform/ui/components/dialog';
import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import type { Row } from '../../../../rows/index.ts';
import { KINDS } from '../../../../../tool/index.ts';
import {
  jobOf,
  type Live,
  LiveContext,
  stateNow,
  subagentIn,
  useLive,
} from '../../../../rows/index.ts';
import { Long, Markdown, type Opening } from '../../../../../words/index.ts';
import { Steps } from '../../steps.tsx';
import { stepsOf } from '../subagent.tsx';
import { tokens } from '../../../../../../panels/details/index.ts';
import {
  Foot,
  Head,
  type Layer,
  said,
  type Standing,
  useKept,
} from './frame.tsx';

/*
 * The subagents opened over the page, each whole: what it was asked,
 * every step it took, and its report. Nothing in one can be changed. Its
 * foot says where it stands and for how long, its model and kind, its
 * steps and the tokens it has used, and a running one can be stopped
 * from there (`frame.tsx`).
 *
 * With a keyboard or a mouse, one dialog shows the deepest one open: a
 * subagent it asked opens in its place, and a back arrow, or Escape, goes
 * back to the one before; a click outside or its close button shuts them
 * all. On a touch screen with no keyboard each is a drawer, the Touch
 * Layers' own, as every Picker's is, and a subagent it asked opens in a
 * drawer over it, so they stack as deep as they nest; a swipe down, a tap
 * outside or its close button shuts the top one.
 */

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

export function SubagentDrawers({
  rows,
  ids,
  running,
  opening,
  live,
  model,
  close,
}: {
  /** The transcript's rows, where each open subagent is found. */
  readonly rows: ReadonlyArray<Row>;
  /** The subagents open, outermost first, by row id. */
  readonly ids: ReadonlyArray<string>;
  /** Whether the session's turn runs. */
  readonly running: boolean;
  readonly opening: Opening;
  readonly live: Live;
  /** The session's model, which a subagent runs unless it names its own. */
  readonly model: string | null;
  /** Closes the drawers from `depth` on. */
  readonly close: (depth: number) => void;
}) {
  const { touch, keyboard } = useDevice();
  if (!touch || keyboard)
    return (
      <Stack
        rows={rows}
        ids={ids}
        running={running}
        opening={opening}
        live={live}
        model={model}
        close={close}
      />
    );
  return (
    <Level
      at={0}
      rows={rows}
      ids={ids}
      running={running}
      opening={opening}
      live={live}
      model={model}
      close={close}
    />
  );
}

function Level({
  at,
  rows,
  ids,
  running,
  opening,
  live,
  model,
  close,
}: {
  readonly at: number;
  readonly rows: ReadonlyArray<Row>;
  readonly ids: ReadonlyArray<string>;
  readonly running: boolean;
  readonly opening: Opening;
  readonly live: Live;
  readonly model: string | null;
  readonly close: (depth: number) => void;
}) {
  const id = ids[at];
  const found = id === undefined ? undefined : subagentIn(rows, id);
  const row = useKept(found);
  const inside = { ...live, depth: at + 1 };
  return (
    <Drawer
      open={found !== undefined}
      onOpenChange={(open) => !open && close(at)}
      label={row?.call.title || 'Subagent'}
      tall
    >
      <>
        {row !== undefined && (
          <LiveContext.Provider value={inside}>
            <Body
              row={row}
              running={running}
              opening={opening}
              layer="drawer"
              model={model}
              back={null}
            />
            {/* Its own subagents open over it, inside it, so they stack. */}
            <Level
              at={at + 1}
              rows={rows}
              ids={ids}
              running={running}
              opening={opening}
              live={live}
              model={model}
              close={close}
            />
          </LiveContext.Provider>
        )}
      </>
    </Drawer>
  );
}

/** The deepest subagent open, in one dialog, with a way back to the one before. */
function Stack({
  rows,
  ids,
  running,
  opening,
  live,
  model,
  close,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly ids: ReadonlyArray<string>;
  readonly running: boolean;
  readonly opening: Opening;
  readonly live: Live;
  readonly model: string | null;
  readonly close: (depth: number) => void;
}) {
  const id = ids.at(-1);
  const found = id === undefined ? undefined : subagentIn(rows, id);
  const row = useKept(found);
  const back = ids.length > 1 ? () => close(ids.length - 1) : null;
  // Focus goes to the dialog itself, not its first button.
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={found !== undefined}
      onOpenChange={(open, details) => {
        if (open) return;
        // Escape goes back one; anything else shuts them all.
        if (details.reason === 'escape-key' && back !== null) back();
        else close(0);
      }}
    >
      <DialogContent
        ref={popup}
        initialFocus={popup}
        showCloseButton={false}
        className="flex max-h-[min(85dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {row !== undefined && (
          <LiveContext.Provider value={{ ...live, depth: ids.length }}>
            <Body
              key={row.id}
              row={row}
              running={running}
              opening={opening}
              layer="dialog"
              model={model}
              back={back}
            />
          </LiveContext.Provider>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  row,
  running,
  opening,
  layer,
  model,
  back,
}: {
  readonly row: SubagentRow;
  readonly running: boolean;
  readonly opening: Opening;
  readonly layer: Layer;
  readonly model: string | null;
  /** Goes back to the subagent that asked this one, in a dialog. */
  readonly back: (() => void) | null;
}) {
  const live = useLive();
  const state = stateNow(row, running, live);
  const job = jobOf(live, row);
  const stopping = job !== undefined && live.stopping.includes(job.id);
  const first = row.rows[0];
  const prompt = first?.kind === 'prompt' ? first : undefined;
  const steps = prompt === undefined ? row.rows : row.rows.slice(1);
  const count = stepsOf(row);
  const report = row.result;
  const standing: Standing =
    state === 'running' && stopping ? 'stopping' : state;
  const details = [
    said(row.call.input, 'model') ?? model,
    said(row.call.input, 'subagent_type'),
    `${count} ${count === 1 ? 'step' : 'steps'}`,
    job?.tokens === undefined ? null : `${tokens(job.tokens)} tokens`,
  ].filter((each) => each !== null);
  return (
    <>
      <Head
        layer={layer}
        icon={<KINDS.subagent.icon />}
        title={row.call.title || 'Subagent'}
        back={back}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-6 sm:px-6">
          {prompt !== undefined && (
            <Section label="Asked">
              <div className="border-l-2 border-border pl-3 text-muted-foreground">
                <Long
                  id={`${row.id}:prompt`}
                  opening={opening}
                  text={prompt.text}
                  className="text-sm"
                />
              </div>
            </Section>
          )}
          <Section label="Steps">
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {state === 'running' ? 'Starting…' : 'No steps.'}
              </p>
            ) : (
              <Steps rows={steps} opening={opening} running={running} />
            )}
          </Section>
          {report ? (
            <Section label={report.isError ? 'Why it failed' : 'Report'}>
              <Markdown
                text={report.output}
                className={`text-sm ${report.isError ? 'text-destructive' : ''}`}
              />
              {report.truncated && (
                <span className="text-xs text-muted-foreground">
                  Report cut short
                </span>
              )}
            </Section>
          ) : state === 'running' ? (
            <Section label="Report">
              <p className="text-sm text-muted-foreground">
                Its report shows here once it finishes.
              </p>
            </Section>
          ) : null}
        </div>
      </div>
      <Foot
        standing={standing}
        since={row.startedAt}
        until={state === 'running' ? null : row.endedAt}
        background={row.background}
        details={details}
        onStop={job === undefined ? null : () => live.stop(job.id)}
      />
    </>
  );
}

function Section({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </section>
  );
}
