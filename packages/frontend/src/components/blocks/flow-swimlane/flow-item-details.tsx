import type { RecordedFlow } from './model';
import { XIcon } from 'lucide-react';

import { JsonTree } from '../otel-trace-viewer/index';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

type RecordedFlowItem = RecordedFlow['items'][number];

const kindStyles: Record<RecordedFlowItem['kind'], string> = {
  activity: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  'activation-end': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'activation-start': 'bg-primary/10 text-primary',
  'local-event': 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  message: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  state: 'bg-muted text-muted-foreground',
};

const kindLabels: Record<RecordedFlowItem['kind'], string> = {
  activity: 'activity',
  'activation-end': 'activation end',
  'activation-start': 'activation start',
  'local-event': 'event',
  message: 'message',
  state: 'state',
};

const statusColor: Record<string, string> = {
  error: 'text-destructive',
  interrupted: 'text-amber-600 dark:text-amber-500',
  running: 'text-primary',
  success: 'text-positive',
  unset: 'text-muted-foreground',
};

const outcomeColor: Record<string, string> = {
  completed: 'text-positive',
  failed: 'text-destructive',
  interrupted: 'text-amber-600 dark:text-amber-500',
};

const severityDot: Record<string, string> = {
  debug: 'bg-muted-foreground/60',
  error: 'bg-destructive',
  info: 'bg-primary',
  warning: 'bg-amber-500',
};

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1) return `${Math.round(milliseconds * 1_000)} µs`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(2)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

/** Detail pane for one selected Flow item: identity, timing, and attributes. */
export function FlowItemDetails({
  item,
  onClose,
  className,
}: {
  readonly item: RecordedFlowItem;
  readonly onClose?: () => void;
  readonly className?: string;
}) {
  const attributes = item.attributes ?? {};
  const hasAttributes = Object.keys(attributes).length > 0;
  const logs = item.kind === 'activity' ? (item.logs ?? []) : [];

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
            kindStyles[item.kind],
          )}
        >
          {kindLabels[item.kind]}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-sm font-medium"
          title={item.name}
        >
          {item.name}
        </span>
        {item.kind === 'activity' && item.duration !== null && (
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {formatDuration(item.duration)}
          </span>
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-8 px-6 py-6">
        <div>
          <SectionLabel>Overview</SectionLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            {item.kind === 'message' ? (
              <>
                <dt className="text-muted-foreground">From</dt>
                <dd className="truncate font-mono" title={item.participantName}>
                  {item.participantName}
                </dd>
                <dt className="text-muted-foreground">To</dt>
                <dd className="truncate font-mono" title={item.destination}>
                  {item.destination}
                </dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Participant</dt>
                <dd className="truncate font-mono" title={item.participantName}>
                  {item.participantName}
                </dd>
              </>
            )}
            {item.kind === 'activity' && (
              <>
                <dt className="text-muted-foreground">Status</dt>
                <dd
                  className={cn(
                    'font-mono capitalize',
                    statusColor[item.status],
                  )}
                >
                  {item.status}
                </dd>
              </>
            )}
            {item.kind === 'activation-end' && (
              <>
                <dt className="text-muted-foreground">Outcome</dt>
                <dd
                  className={cn(
                    'font-mono capitalize',
                    outcomeColor[item.outcome],
                  )}
                >
                  {item.outcome}
                </dd>
              </>
            )}
            {item.kind === 'message' && item.replyTo !== undefined && (
              <>
                <dt className="text-muted-foreground">Replies to</dt>
                <dd className="truncate font-mono" title={item.replyTo}>
                  {item.replyTo}
                </dd>
              </>
            )}
            {item.kind !== 'activity' && (
              <>
                <dt className="text-muted-foreground">Severity</dt>
                <dd className="font-mono capitalize">{item.severity}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Time</dt>
            <dd
              className="font-mono tabular-nums"
              title={new Date(item.timestamp).toISOString()}
            >
              {formatTime(item.timestamp)}
            </dd>
            {item.kind === 'activity' && (
              <>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="font-mono tabular-nums">
                  {item.duration === null
                    ? 'running'
                    : formatDuration(item.duration)}
                </dd>
              </>
            )}
          </dl>
          {(item.kind === 'activity' || item.kind === 'activation-end') &&
            (item.kind === 'activity'
              ? item.status === 'interrupted'
              : item.outcome === 'interrupted') && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Stopped by lifecycle teardown — not a failure.
              </p>
            )}
        </div>

        {item.kind === 'state' && (
          <div>
            <SectionLabel>Published</SectionLabel>
            <JsonTree value={item.state} />
            <div className="mt-6">
              <SectionLabel>Participant state here</SectionLabel>
              <JsonTree value={item.merged} />
            </div>
          </div>
        )}

        {hasAttributes && item.kind !== 'state' && (
          <div>
            <SectionLabel>Attributes</SectionLabel>
            <JsonTree value={attributes} />
          </div>
        )}

        {logs.length > 0 && (
          <div>
            <SectionLabel>Logs</SectionLabel>
            <div className="flex flex-col gap-4">
              {logs.map((log, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1 size-2 shrink-0 rounded-full',
                        severityDot[log.severity] ?? 'bg-muted-foreground/60',
                      )}
                    />
                    <span className="min-w-0 flex-1 break-words text-sm leading-relaxed">
                      {log.message}
                    </span>
                    <span
                      className="shrink-0 tabular-nums text-xs text-muted-foreground"
                      title={new Date(log.timestamp).toISOString()}
                    >
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                  {log.attributes && (
                    <div className="pl-4.5">
                      <JsonTree value={log.attributes} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAttributes && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No attributes or logs.
          </p>
        )}
      </div>
    </div>
  );
}
