import { type ReactNode, useContext, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@kestack/web-platform/ui/components/drawer';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { Row } from '../../../rows/index.ts';
import { Folder, KINDS, StateMark } from '../../../../tool/index.ts';
import {
  jobOf,
  type Live,
  LiveContext,
  stateNow,
  subagentIn,
} from '../../../rows/index.ts';
import {
  Count,
  Long,
  Markdown,
  type Opening,
} from '../../../../words/index.ts';
import { Steps } from '../steps.tsx';
import { doingOf, stepsOf } from './subagent.tsx';

/*
 * The subagents opened over the page, each whole in a drawer of its own:
 * what it was asked, every step it took, and its report. Nothing in one
 * can be changed. A subagent it asked opens in a drawer over it, so the
 * drawers stack as deep as the subagents nest, the ones under it stepping
 * back. A swipe down, a tap outside, Escape or its close button shuts the
 * top one; a running one can be stopped from its head.
 */

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

export function SubagentDrawers({
  rows,
  ids,
  running,
  opening,
  live,
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
  /** Closes the drawers from `depth` on. */
  readonly close: (depth: number) => void;
}) {
  return (
    <Level
      at={0}
      rows={rows}
      ids={ids}
      running={running}
      opening={opening}
      live={live}
      close={close}
    />
  );
}

/** The last value that was not undefined: what a drawer shows as it closes. */
const useKept = <A,>(value: A | undefined): A | undefined => {
  const kept = useRef(value);
  if (value !== undefined) kept.current = value;
  return value ?? kept.current;
};

function Level({
  at,
  rows,
  ids,
  running,
  opening,
  live,
  close,
}: {
  readonly at: number;
  readonly rows: ReadonlyArray<Row>;
  readonly ids: ReadonlyArray<string>;
  readonly running: boolean;
  readonly opening: Opening;
  readonly live: Live;
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
    >
      <DrawerContent className="data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-2.5rem)]">
        {row !== undefined && (
          <LiveContext.Provider value={inside}>
            <Body row={row} running={running} opening={opening} />
            {/* Its own subagents open over it, inside it, so they stack. */}
            <Level
              at={at + 1}
              rows={rows}
              ids={ids}
              running={running}
              opening={opening}
              live={live}
              close={close}
            />
          </LiveContext.Provider>
        )}
      </DrawerContent>
    </Drawer>
  );
}

const STATE_WORD = {
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
} as const;

function Body({
  row,
  running,
  opening,
}: {
  readonly row: SubagentRow;
  readonly running: boolean;
  readonly opening: Opening;
}) {
  const folder = useContext(Folder);
  const live = useContext(LiveContext);
  const state = stateNow(row, running, live);
  const job = jobOf(live, row);
  const stopping = job !== undefined && live.stopping.includes(job.id);
  const first = row.rows[0];
  const prompt = first?.kind === 'prompt' ? first : undefined;
  const steps = prompt === undefined ? row.rows : row.rows.slice(1);
  const count = stepsOf(row);
  const report = row.result;
  return (
    <>
      <header className="shrink-0 border-b border-border/70">
        <div className="mx-auto flex w-full max-w-3xl items-start gap-3 px-4 pt-4 pb-3 sm:px-6">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
            <KINDS.subagent.icon />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DrawerTitle className="truncate text-base leading-6">
              {row.call.title || 'Subagent'}
            </DrawerTitle>
            <DrawerDescription
              render={<div />}
              className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
            >
              {state === 'running' ? (
                <>
                  <Spinner aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{doingOf(row, folder)}…</span>
                </>
              ) : (
                <>
                  <StateMark state={state} />
                  <span
                    className={state === 'failed' ? 'text-destructive' : ''}
                  >
                    {STATE_WORD[state]}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="shrink-0">
                <Count value={count} /> {count === 1 ? 'step' : 'steps'}
              </span>
              {row.background && (
                <>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">In the background</span>
                </>
              )}
            </DrawerDescription>
          </div>
          {state === 'running' && job !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stopping}
              onClick={() => live.stop(job.id)}
              className="shrink-0 rounded-full pointer-coarse:h-10"
            >
              {stopping && <Spinner />}
              Stop
            </Button>
          )}
          <DrawerClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                className="-mr-2 shrink-0 pointer-coarse:size-11"
              />
            }
          >
            <XIcon aria-hidden className="size-4" />
          </DrawerClose>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
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
