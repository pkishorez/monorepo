import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Check,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  Pause,
  Play,
  Plus,
  X,
} from 'lucide-react';
import { View, useChildren } from '@kestack/kabuki/react';
import type { Handle, ViewProps } from '@kestack/kabuki/react';
import { DURATION, DownloadLive, DownloadsLive, STEP } from '../story/index.ts';
import { Button, EASE, Wide } from './parts.tsx';

/** The height of one download in the list, in pixels. */
const ROW = 64;

const FADE = { duration: 0.2, ease: 'easeOut' } as const;

/** How the list moves: rows sliding and the card growing, together. */
const SLIDE = { duration: 0.35, ease: EASE } as const;

/**
 * The list of downloads: one row per file, each its own Instance, newest on
 * top. Rows sit where a transform puts them, never in the flow: a new one
 * fades in on top as the rest slide down, and when one goes, the rows under
 * it slide up. The card grows and shrinks with them, and it is the last
 * thing on the page, so nothing else moves.
 */
export const DownloadsView = View.make(
  DownloadsLive,
  ({ model, children, send }) => (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-medium">Downloads</h2>
          <Count files={children.files} />
        </div>
        <div className="flex shrink-0 items-center gap-1 @md:gap-2">
          <AllButtons
            files={model.files}
            downloads={children.files}
            send={send}
          />
          <Button
            tone="primary"
            label="Add file"
            onClick={() => send({ _tag: 'Add' })}
          >
            <Plus className="size-3.5" />
            <Wide>Add file</Wide>
          </Button>
        </div>
      </div>
      <motion.div
        initial={false}
        animate={{ height: Math.max(1, children.files.length) * ROW }}
        transition={SLIDE}
        className="relative overflow-hidden rounded-2xl border border-border bg-card"
      >
        <motion.p
          initial={false}
          animate={{ opacity: children.files.length === 0 ? 1 : 0 }}
          transition={FADE}
          className="absolute inset-x-0 top-0 grid place-items-center text-[13px] text-muted-foreground"
          style={{ height: ROW }}
        >
          No downloads yet. Add a file to start one.
        </motion.p>
        <AnimatePresence initial={false}>
          {children.files.map((file, index) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, y: index * ROW }}
              animate={{ opacity: 1, y: index * ROW }}
              exit={{ opacity: 0, transition: FADE }}
              transition={{ opacity: FADE, y: SLIDE }}
              className={`absolute inset-x-0 top-0 border-border bg-card ${index > 0 ? 'border-t' : ''}`}
              style={{ height: ROW }}
            >
              <DownloadView instance={file} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  ),
);

/** How many files there are and how many are done, read from the Downloads themselves. */
function Count({
  files,
}: {
  readonly files: ReadonlyArray<Handle<typeof DownloadLive>>;
}) {
  // Picks only whether each is done, so a tick of progress never redraws it.
  const downloads = useChildren(files, (file) => file._tag === 'Done');
  const done = downloads.filter(Boolean).length;
  return (
    <span className="truncate text-xs text-muted-foreground tabular-nums">
      {downloads.length === 0
        ? 'none yet'
        : `${done} of ${downloads.length} done`}
    </span>
  );
}

/**
 * Pause all, or resume all once every unfinished file is paused, and cancel
 * all. Each only changes the list's own data: the Downloads follow it. It
 * reads which Downloads are done, so it never offers to pause a finished one.
 */
function AllButtons({
  files,
  downloads,
  send,
}: {
  readonly files: ViewProps<typeof DownloadsLive>['model']['files'];
  readonly downloads: ReadonlyArray<Handle<typeof DownloadLive>>;
  readonly send: ViewProps<typeof DownloadsLive>['send'];
}) {
  const done = new Set(
    useChildren(downloads, (file) => file._tag === 'Done' && file.model.id),
  );
  const unfinished = files.filter((file) => !done.has(file.id));
  const allPaused =
    unfinished.length > 0 && unfinished.every((file) => file.paused);
  return (
    <>
      <Button
        disabled={unfinished.length === 0}
        label={allPaused ? 'Resume all' : 'Pause all'}
        onClick={() => send({ _tag: allPaused ? 'ResumeAll' : 'PauseAll' })}
      >
        {allPaused ? (
          <Play className="size-3.5" />
        ) : (
          <Pause className="size-3.5" />
        )}
        <Wide>{allPaused ? 'Resume all' : 'Pause all'}</Wide>
      </Button>
      <Button
        disabled={files.length === 0}
        label="Cancel all"
        onClick={() => send({ _tag: 'CancelAll' })}
      >
        <X className="size-3.5" />
        <Wide>Cancel all</Wide>
      </Button>
    </>
  );
}

const DownloadView = View.make(DownloadLive, (self) => <Row {...self} />);

const ICONS = {
  zip: FileArchive,
  mp3: FileAudio,
  pdf: FileText,
  mp4: FileVideo,
};

/** Two things in one place: one fades out as the other fades in, neither moving. */
function Swap({
  shown,
  className = '',
  children,
}: {
  /** Which child is shown, by key. */
  readonly shown: string;
  readonly className?: string;
  readonly children: Readonly<Record<string, ReactNode>>;
}) {
  return (
    <span className={`grid *:col-start-1 *:row-start-1 ${className}`}>
      <AnimatePresence initial={false}>
        <motion.span
          key={shown}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
          className="grid place-items-center"
        >
          {children[shown]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Row(self: ViewProps<typeof DownloadLive>) {
  const { model, props, send } = self;
  const Icon =
    ICONS[model.name.split('.').at(-1) as keyof typeof ICONS] ?? FileText;
  const done = self._tag === 'Done';
  const status = done ? 'Done' : props.paused ? 'Paused' : 'Downloading';
  return (
    <div className="flex h-full items-center gap-3 px-4">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-200 ${
          done
            ? 'bg-emerald-500/10 text-emerald-500'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        <Swap shown={done ? 'done' : 'file'}>
          {{
            done: <Check className="size-4" strokeWidth={2.5} />,
            file: <Icon className="size-4" />,
          }}
        </Swap>
      </span>
      <Progress name={model.name} done={model.done} status={status} />
      {/* Two button slots always, so a button going never moves the bar. */}
      <div className="flex shrink-0 items-center">
        <Swap shown={status} className="size-8">
          {{
            Downloading: (
              <Button
                tone="icon"
                label="Pause"
                onClick={() => send({ _tag: 'Pause' })}
              >
                <Pause />
              </Button>
            ),
            Paused: (
              <Button
                tone="icon"
                label="Resume"
                onClick={() => send({ _tag: 'Resume' })}
              >
                <Play />
              </Button>
            ),
            Done: null,
          }}
        </Swap>
        <Button
          tone="icon"
          label={done ? 'Remove' : 'Cancel'}
          onClick={() => send({ _tag: 'Cancel' })}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

/** A bar that follows how far along a file is, eased across each step it reports. */
function Bar({
  along,
  paused,
}: {
  readonly along: number;
  readonly paused: boolean;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ scaleX: along }}
      transition={{ duration: STEP / 1000, ease: 'linear' }}
      className={`h-full origin-left rounded-full transition-colors duration-200 ${
        paused ? 'bg-foreground/30' : 'bg-emerald-500'
      }`}
    />
  );
}

function Progress({
  name,
  done,
  status,
}: {
  readonly name: string;
  /** Milliseconds of it downloaded. */
  readonly done: number;
  readonly status: 'Downloading' | 'Paused' | 'Done';
}) {
  const along = done / DURATION;
  const percent = `${Math.floor(along * 100)}%`;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="truncate font-medium">{name}</span>
        {/* A fixed width, so a status of any length never moves the name. */}
        <Swap
          shown={status}
          className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums *:justify-items-end @md:w-20"
        >
          {{
            Downloading: <span>{percent}</span>,
            // Narrow, the grey bar and the Resume button say it is paused.
            Paused: (
              <span>
                <Wide>Paused · </Wide>
                {percent}
              </span>
            ),
            Done: 'Done',
          }}
        </Swap>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
        <Bar along={along} paused={status === 'Paused'} />
      </div>
    </div>
  );
}
