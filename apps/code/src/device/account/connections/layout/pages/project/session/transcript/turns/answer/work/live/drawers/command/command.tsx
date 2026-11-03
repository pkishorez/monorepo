import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import type { BackgroundJob } from '@kestack/connect/code';
import {
  CheckIcon,
  CopyIcon,
  FolderIcon,
  SquareTerminalIcon,
} from 'lucide-react';
import { useDevice } from '@kestack/web-platform/ui/input';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Dialog,
  DialogContent,
} from '@kestack/web-platform/ui/components/dialog';
import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import { tilde } from '../../../../../../../../../../../../../../ui/labels/path/index.ts';
import type { Row } from '../../../../../rows/index.ts';
import { useLive } from '../../../../../rows/index.ts';
import { Folder } from '../../../../../../tool/index.ts';
import {
  Foot,
  Head,
  type Layer,
  said,
  type Standing,
  useKept,
} from '../frame.tsx';
import { Output, useScreen } from './output.tsx';

/*
 * A background command opened over the page, from the Running Picker:
 * what it runs and where, and what it writes, live, as a terminal shows
 * it (`output.tsx`, `ansi.ts`). Its foot says how long it has run and who
 * started it, the session or one of its subagents, and stops it. Once it
 * ends it stays drawn, as it ended, until it is closed. With a keyboard
 * or a mouse it is a dialog; on a touch screen with no keyboard, a
 * drawer.
 */

/** The command open, as the page keeps it. */
export interface OpenCommand {
  readonly jobId: string;
  /** Its job as last listed. */
  readonly job: BackgroundJob;
  /** What it wrote, piece by piece. */
  readonly output: ReadonlyArray<string>;
  /** How many pieces before the first were dropped. */
  readonly dropped: number;
  /** Whether it was asked to stop from here. */
  readonly stopped: boolean;
  /** Which read of its output the pieces are from. */
  readonly run: number;
}

type ToolRow = Extract<Row, { readonly kind: 'tool' }>;
type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

/** The tool call `callId` is, wherever it is nested, and the subagent that made it. */
const calledIn = (
  rows: ReadonlyArray<Row>,
  callId: string,
  by: SubagentRow | null = null,
): { readonly row: ToolRow; readonly by: SubagentRow | null } | undefined => {
  for (const row of rows) {
    if (row.kind === 'tool' && row.call.id === callId) return { row, by };
    if (row.kind === 'subagent') {
      const inner = calledIn(row.rows, callId, row);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
};

/** When `running` last turned false, for each job. */
const useEndedAt = (jobId: string, running: boolean) => {
  const [ended, setEnded] = useState<{
    readonly jobId: string;
    readonly at: number;
  } | null>(null);
  useEffect(() => {
    if (running) return;
    setEnded((was) => (was?.jobId === jobId ? was : { jobId, at: Date.now() }));
  }, [jobId, running]);
  return ended !== null && ended.jobId === jobId ? ended.at : null;
};

export function CommandDrawer({
  command,
  rows,
  onClose,
}: {
  /** The command open; null while none is. */
  readonly command: OpenCommand | null;
  /** The transcript's rows, where its tool call is found. */
  readonly rows: ReadonlyArray<Row>;
  readonly onClose: () => void;
}) {
  const { touch, keyboard } = useDevice();
  const kept = useKept(command ?? undefined);
  const layer: Layer = !touch || keyboard ? 'dialog' : 'drawer';
  const open = command !== null;
  const title = kept?.job.title || 'Command';
  const body =
    kept === undefined ? null : (
      <Body command={kept} rows={rows} layer={layer} />
    );
  if (layer === 'drawer')
    return (
      <Drawer
        open={open}
        onOpenChange={(next) => !next && onClose()}
        label={title}
        tall
      >
        <>{body}</>
      </Drawer>
    );
  return (
    <Popup open={open} onClose={onClose}>
      {body}
    </Popup>
  );
}

function Popup({
  open,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  // Focus goes to the dialog itself, not its first button.
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        ref={popup}
        initialFocus={popup}
        showCloseButton={false}
        className="flex h-[min(85dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  command,
  rows,
  layer,
}: {
  readonly command: OpenCommand;
  readonly rows: ReadonlyArray<Row>;
  readonly layer: Layer;
}) {
  const live = useLive();
  const folder = useContext(Folder);
  const { job } = command;
  const running = live.jobs.some((each) => each.id === command.jobId);
  const endedAt = useEndedAt(command.jobId, running);
  const called =
    job.toolCallId === undefined ? undefined : calledIn(rows, job.toolCallId);
  const input = called?.row.call.input;
  const text = said(input, 'command') ?? job.title;
  const cwd = said(input, 'cwd') ?? folder;
  const shown = useScreen(
    `${command.jobId}:${command.run}`,
    command.output,
    command.dropped,
  );
  const { lines } = shown;
  const standing: Standing = running
    ? live.stopping.includes(command.jobId)
      ? 'stopping'
      : 'running'
    : command.stopped
      ? 'stopped'
      : 'ended';
  return (
    <>
      <Head
        layer={layer}
        icon={<SquareTerminalIcon />}
        title={job.title || 'Command'}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-4 sm:px-6">
          <Section label="Command">
            <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
              <code className="max-h-32 min-w-0 flex-1 overflow-y-auto font-mono text-[13px] leading-5 wrap-break-word whitespace-pre-wrap select-text">
                <span aria-hidden className="text-muted-foreground select-none">
                  ${' '}
                </span>
                {text}
              </code>
              <Copy text={text} />
            </div>
            {cwd !== null && (
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate font-mono" title={cwd}>
                  {tilde(cwd)}
                </span>
              </div>
            )}
          </Section>
          <Section
            label="Output"
            className="min-h-0 flex-1"
            aside={
              lines.length === 0 ? null : (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {lines.length} {lines.length === 1 ? 'line' : 'lines'}
                </span>
              )
            }
          >
            <Output shown={shown} live={running} />
          </Section>
        </div>
      </div>
      <Foot
        standing={standing}
        since={job.startedAt ?? null}
        until={endedAt}
        background
        details={[
          called?.by == null
            ? 'Started by the session'
            : `Started by ${called.by.call.title || 'a subagent'}`,
        ]}
        onStop={() => live.stop(command.jobId)}
      />
    </>
  );
}

function Section({
  label,
  aside,
  className = '',
  children,
}: {
  readonly label: string;
  readonly aside?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Copy({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? 'Copied' : 'Copy the command'}
      title="Copy"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => {},
        )
      }
      className="-my-1 -mr-1.5 shrink-0 text-muted-foreground pointer-coarse:size-10"
    >
      {copied ? (
        <CheckIcon aria-hidden className="size-3.5" />
      ) : (
        <CopyIcon aria-hidden className="size-3.5" />
      )}
    </Button>
  );
}
