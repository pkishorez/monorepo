import { AnimatePresence, motion } from 'motion/react';
import type { ProofLeaf, StoryNode, TellingIssue } from 'laymos/story/schema';

import {
  ChevronDown,
  Globe,
  ShieldAlert,
  Terminal,
  TriangleAlert,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import { StateMark } from '../badges';
import { useCanvasState } from '../canvas-context';
import { stateStyles } from '../state-style';
import {
  isFailing,
  ownProofCounts,
  proofsBeneath,
  proofState,
  rollupOf,
  tallyOf,
  type Rollup,
  type Tally,
} from '../story-scope';
import { Telling } from '../telling/telling';
import { progressOf, runningNow } from '../run-progress';
import {
  RunButton,
  RunCount,
  RunningBar,
  RunningGlow,
  VerdictFlash,
} from './run-motion';

/** How wide a card would like to be; the layout may make it narrower. */
export const storyCardWidth = { closed: 300, open: 520 } as const;

const issueLabels: Readonly<Record<TellingIssue['kind'], string>> = {
  'missing-telling': 'No Telling',
  'incomplete-telling': 'Telling has no title or pitch',
  'broken-link': 'Broken link',
  'unnamed-part': 'Part never named',
};

const ease = [0.23, 1, 0.32, 1] as const;

/**
 * A Story as a card: its title, pitch and one result for everything beneath
 * it; once open its whole Telling, then its own Proofs listed beneath it.
 */
export function StoryCard({
  story,
  open,
  width,
  top,
  unfolded,
  tabbable,
  onFold,
}: {
  readonly story: StoryNode;
  readonly open: boolean;
  /** As wide as the layout placed it. */
  readonly width: number;
  readonly top: boolean;
  /** Whether its Proof list is unfolded. */
  readonly unfolded: boolean;
  /** Whether its footer and Proof rows take Tab. */
  readonly tabbable: boolean;
  readonly onFold: () => void;
}) {
  const {
    reports,
    running,
    pending,
    run,
    finished,
    index,
    reducedMotion,
    onRun,
    onStoryLink,
    onProofLink,
  } = useCanvasState();
  const tally = tallyOf(story, reports, running, pending);
  const isRunning = tally.counts.running > 0;
  const beneath = proofsBeneath(story);
  const progress = progressOf(beneath, run?.scope ?? new Set(), finished);
  // From the moment a run begins until all of its share here is done.
  const inRun = run?.active === true && progress.done < progress.total;
  const now = isRunning ? runningNow(beneath, run, running) : undefined;

  return (
    <div className="relative flex flex-col" style={{ width }}>
      <RunningGlow running={isRunning || inRun} reducedMotion={reducedMotion} />
      {(isRunning || inRun) && (
        <RunningBar
          fraction={progress.total === 0 ? 0 : progress.done / progress.total}
          reducedMotion={reducedMotion}
        />
      )}
      <VerdictFlash
        running={isRunning}
        colour={tally.criticalFailing ? 'bg-destructive' : 'bg-foreground'}
        reducedMotion={reducedMotion}
      />
      <div className="px-4 pb-3.5 pt-3.5">
        <div className="flex h-5 items-center gap-2">
          {now === undefined ? (
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
              {top ? 'Top Story' : story.name}
            </span>
          ) : (
            // While its Proofs run, the line names the one running now.
            <span
              title={now.proof.title}
              className="flex min-w-0 items-baseline gap-1 text-[11px] text-muted-foreground"
            >
              <span className="min-w-0 truncate">{now.proof.title}</span>
              {now.others > 0 && (
                <span className="shrink-0 tabular-nums">+{now.others}</span>
              )}
            </span>
          )}
          {story.issues.length > 0 && (
            <span
              title={story.issues.map((issue) => issue.message).join('\n')}
              className="inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-amber-500/12 px-1.5 py-px text-[11px] font-medium text-amber-700 dark:text-amber-400"
            >
              <TriangleAlert className="size-3" aria-hidden />
              {story.issues.length}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <RunCount
              shown={run?.active === true}
              done={progress.done}
              total={progress.total}
              reducedMotion={reducedMotion}
              className="mr-0.5"
            />
            <RunButton
              label={`Run every Proof in ${story.title}`}
              running={isRunning}
              onRun={() => onRun(story.id)}
              shown={open}
            />
            <RollupDot tally={tally} />
          </span>
        </div>
        <h3
          className={cn(
            'mt-1 font-semibold leading-snug tracking-[-0.005em] text-balance',
            top ? 'text-[17px]' : 'text-[15px]',
          )}
        >
          {story.title}
        </h3>
        {story.pitch === '' ? (
          <p className="mt-1.5 text-[13px] italic text-muted-foreground">
            No pitch yet.
          </p>
        ) : (
          <p
            className={cn(
              'mt-1.5 text-[13px] leading-[1.55] text-muted-foreground text-pretty max-sm:text-[15px]',
              !open && 'line-clamp-3',
            )}
          >
            {story.pitch}
          </p>
        )}
      </div>
      {open && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.08, ease }}
        >
          <div className="border-t border-border/70 px-4 pb-2 pt-1">
            {story.body.trim() === '' ? (
              <p className="py-2.5 text-[13px] italic text-muted-foreground">
                The Telling says nothing more.
              </p>
            ) : (
              <Telling
                markdown={story.body}
                index={index}
                onStory={onStoryLink}
                onProof={onProofLink}
              />
            )}
            {story.issues.length > 0 && (
              <ul className="mb-2 mt-1 flex flex-col gap-1 rounded-md bg-amber-500/[0.07] px-2.5 py-2 text-xs">
                {story.issues.map((issue, position) => (
                  <li key={position} className="flex gap-2">
                    <TriangleAlert
                      className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                    <span>
                      <span className="font-medium">
                        {issueLabels[issue.kind]}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {issue.message}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {story.proofs.length > 0 && (
            <ProvedBy
              story={story}
              unfolded={unfolded}
              tabbable={tabbable}
              onFold={onFold}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}

const rollupLooks: Readonly<
  Record<Rollup, { readonly mark: string; readonly label: string }>
> = {
  running: { mark: 'bg-sky-500', label: 'Running' },
  pending: { mark: 'bg-muted-foreground/40', label: 'Waiting to run' },
  critical: {
    mark: 'bg-destructive ring-[1.5px] ring-destructive/40 ring-offset-[1.5px] ring-offset-card',
    label: 'A Critical Proof failed',
  },
  failing: { mark: 'bg-destructive', label: 'Something failed' },
  passed: { mark: 'bg-positive', label: 'Everything passed' },
  'not-run': { mark: 'bg-muted-foreground/30', label: 'Not run' },
};

/** One dot for every Proof beneath a Story. */
function RollupDot({ tally }: { readonly tally: Tally }) {
  const rollup = rollupOf(tally);
  const look = rollupLooks[rollup];
  const label =
    tally.total === 0
      ? 'No Proofs yet'
      : `${look.label} · ${tally.counts.passed} of ${tally.total} passed`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="relative flex size-6 items-center justify-center"
    >
      {rollup === 'running' && (
        <span className="absolute size-2 animate-ping rounded-full bg-sky-500/60 motion-reduce:hidden" />
      )}
      <span
        className={cn(
          'relative size-2 rounded-full transition-colors duration-300',
          look.mark,
        )}
      />
    </span>
  );
}

/** The footer with a Story's own Proofs, listed until the reader folds them away. */
function ProvedBy({
  story,
  unfolded,
  tabbable,
  onFold,
}: {
  readonly story: StoryNode;
  readonly unfolded: boolean;
  readonly tabbable: boolean;
  readonly onFold: () => void;
}) {
  const { reports, running, pending, run, finished, reducedMotion } =
    useCanvasState();
  const counts = ownProofCounts(story, reports, running, pending);
  const progress = progressOf(story.proofs, run?.scope ?? new Set(), finished);
  const listId = `proofs-of-${story.id}`;

  return (
    <div className="border-t border-border/70 bg-muted/25">
      <button
        type="button"
        data-space-ignore
        tabIndex={tabbable ? 0 : -1}
        aria-expanded={unfolded}
        aria-controls={listId}
        onClick={(event) => {
          event.stopPropagation();
          onFold();
        }}
        className="relative flex h-9 w-full items-center gap-1.5 px-4 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        <span className="font-medium text-foreground/85">
          Proved by {counts.total}
        </span>
        {counts.passed > 0 && (
          <span className="tabular-nums">
            · <span className="text-positive">{counts.passed} ✓</span>
          </span>
        )}
        {counts.failing > 0 && (
          <span className="tabular-nums">
            · <span className="text-destructive">{counts.failing} ✗</span>
          </span>
        )}
        <RunCount
          shown={run?.active === true}
          done={progress.done}
          total={progress.total}
          reducedMotion={reducedMotion}
          className="absolute right-10"
        />
        <ChevronDown
          aria-hidden
          className={cn(
            'ml-auto size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none',
            unfolded && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {unfolded && (
          <motion.div
            id={listId}
            key="proofs"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: { duration: reducedMotion ? 0 : 0.26, ease },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: reducedMotion ? 0 : 0.2, ease },
            }}
          >
            <ul aria-label={`Proofs of ${story.title}`} className="px-2 pb-2">
              {story.proofs.map((proof) => (
                <ProofRow key={proof.id} proof={proof} tabbable={tabbable} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProofRow({
  proof,
  tabbable,
}: {
  readonly proof: ProofLeaf;
  readonly tabbable: boolean;
}) {
  const {
    reports,
    running,
    pending,
    criticalOnly,
    shownProof,
    onRun,
    onShowProof,
  } = useCanvasState();
  const state = proofState(proof.id, reports, running, pending);
  const VenueIcon = proof.venue === 'browser' ? Globe : Terminal;
  const open = () => onShowProof(proof.id);

  return (
    <li
      role="button"
      data-space-ignore
      data-proof={proof.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${proof.title}: ${stateStyles[state].label}`}
      onClick={(event) => {
        event.stopPropagation();
        open();
      }}
      className={cn(
        'group/row flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-1 outline-none transition-[background-color,opacity] duration-150',
        'hover:bg-background focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-sky-500',
        shownProof === proof.id && 'bg-background',
        criticalOnly && !proof.critical && 'opacity-40',
      )}
    >
      <StateMark state={state} />
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-pretty max-sm:text-[15px] max-sm:leading-[1.45]">
        {proof.title}
      </span>
      {proof.critical && (
        <ShieldAlert
          role="img"
          aria-label="Critical"
          className={cn(
            'size-3.5 shrink-0',
            isFailing(state) ? 'text-destructive' : 'text-foreground/80',
          )}
        >
          <title>Critical</title>
        </ShieldAlert>
      )}
      <VenueIcon
        role="img"
        aria-label={proof.venue === 'browser' ? 'Browser' : 'Process'}
        className="size-3.5 shrink-0 text-muted-foreground/80"
      >
        <title>
          {proof.venue === 'browser'
            ? 'Runs in a browser'
            : 'Runs in the process'}
        </title>
      </VenueIcon>
      <RunButton
        label={`Run ${proof.title}`}
        running={state === 'running'}
        onRun={() => onRun(proof.id)}
        reveal="row"
        shown
      />
    </li>
  );
}
