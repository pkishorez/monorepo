import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { memo, useContext, useMemo } from 'react';
import {
  Chevron,
  Folded,
  Head,
  type Opening,
  Under,
  useOpen,
  useSticky,
} from '../../../words/index.ts';
import { type Row, sameItems } from '../../rows/index.ts';
import {
  Folder,
  type Image,
  Images,
  KINDS,
  Lines,
  summary,
} from '../../../tool/index.ts';
import { stateNow, useLive } from '../../rows/index.ts';
import { Steps } from './steps.tsx';
import { kindsOf, tally } from './tally.ts';

/*
 * Everything the agent did between two things it said, as one quiet line
 * that opens to the steps. Done, it counts the work up beside the icons of
 * the kinds of tool it used, how many steps failed, and whether any were
 * stopped. While it runs, it
 * says what the agent is doing now, a step at a time, so a long turn
 * never looks stuck. The whole width of the line opens it; open, every
 * step in order, the line stuck to the top while they scroll under it.
 * The images its tools gave back, such as screenshots, show under it at
 * once, not folded away with their steps.
 */

/** The images a run's tools gave back, in order. */
const imagesOf = (rows: ReadonlyArray<Row>): ReadonlyArray<Image> =>
  rows.flatMap((row) =>
    row.kind === 'tool' ? (row.result?.images ?? []) : [],
  );

/** What the agent is doing now, in a few words, while the run is the live one. */
const nowOf = (rows: ReadonlyArray<Row>, folder: string | null): string => {
  const last = rows.at(-1);
  const call = [...rows]
    .reverse()
    .find((row) => row.kind === 'tool' && row.state === 'running');
  if (call?.kind === 'tool') {
    const { verb, target } = summary(call.call, 'running', folder);
    return `${verb} ${target}`.trim();
  }
  const subagent = [...rows]
    .reverse()
    .find((row) => row.kind === 'subagent' && row.state === 'running');
  if (subagent?.kind === 'subagent')
    return `A subagent is working: ${subagent.call.title}`;
  if (last?.kind === 'reasoning') return 'Thinking';
  return 'Working';
};

interface WorkProps {
  readonly id: string;
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs. */
  readonly running: boolean;
  /** Whether this run of work is going on now: the last thing in a turn that runs, or a step of it still running. */
  readonly live: boolean;
}

/** Drawn again only as its steps, or whether it runs, change. */
export const Work = memo(
  WorkLine,
  (a, b) =>
    a.id === b.id &&
    a.opening === b.opening &&
    a.running === b.running &&
    a.live === b.live &&
    sameItems(a.rows, b.rows),
);

function WorkLine({ id, rows, opening, running, live }: WorkProps) {
  const folder = useContext(Folder);
  const jobs = useLive();
  const open = useOpen(opening, id);
  const sticky = useSticky(open, () => opening.toggle(id));
  const states = rows.flatMap((row) =>
    row.kind === 'tool' || row.kind === 'subagent'
      ? [stateNow(row, running, jobs)]
      : [],
  );
  const failed = states.filter((state) => state === 'failed').length;
  const stopped = !live && states.includes('stopped');
  const said = live ? nowOf(rows, folder) : tally(rows);
  const images = useMemo(() => imagesOf(rows), [rows]);
  const lines = useMemo(
    () =>
      rows.reduce(
        (sum, row) => {
          if (row.kind !== 'tool') return sum;
          const counted = summary(row.call, 'done', folder).lines;
          return counted === null
            ? sum
            : {
                added: sum.added + counted.added,
                removed: sum.removed + counted.removed,
              };
        },
        { added: 0, removed: 0 },
      ),
    [rows, folder],
  );
  return (
    <div className="flex min-w-0 flex-col">
      <Head sticky={sticky} className="-mx-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={sticky.toggle}
          className="focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground keyboard:min-h-9 motion-reduce:transition-none"
        >
          {live ? (
            <Spinner aria-hidden className="size-3.5 shrink-0" />
          ) : (
            <Icons rows={rows} />
          )}
          <span role={live ? 'status' : undefined} className="min-w-0 truncate">
            {said}
            {live && '…'}
          </span>
          {failed > 0 && (
            <span className="shrink-0 font-medium text-destructive">
              · {failed} failed
            </span>
          )}
          {stopped && <span className="shrink-0">· stopped</span>}
          {!live && <Lines lines={lines} />}
          <Chevron open={open} />
        </button>
      </Head>
      {images.length > 0 && (
        <div className="mt-1 mb-1">
          <Images images={images} size="sm" />
        </div>
      )}
      <Folded
        open={open}
        className="mt-1 ml-[7px] min-w-0 border-l border-border pl-4"
      >
        <Under sticky={sticky}>
          <Steps rows={rows} opening={opening} running={running} />
        </Under>
      </Folded>
    </div>
  );
}

/** Up to three icons of the kinds of tool a run used, overlapping. */
function Icons({ rows }: { readonly rows: ReadonlyArray<Row> }) {
  const kinds = kindsOf(rows).slice(0, 3);
  if (kinds.length === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1">
      {kinds.map((kind) => {
        const Icon = KINDS[kind].icon;
        return (
          <span
            key={kind}
            className="grid size-5 place-items-center rounded-full bg-background ring-1 ring-border"
          >
            <Icon className="size-3" />
          </span>
        );
      })}
    </span>
  );
}
