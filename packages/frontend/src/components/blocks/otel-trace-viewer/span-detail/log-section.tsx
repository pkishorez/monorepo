import { useMemo, useState } from 'react';

import { ChevronRightIcon, SearchIcon, XIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { cn } from '#lib/utils';

import {
  detectLogSeverity,
  LOG_SEVERITY_DOT_CLASS,
  LOG_SEVERITY_LABEL_CLASS,
  type LogSeverity,
} from '../log-severity';
import type { OtelEvent } from '../trace-model';
import { formatDuration } from '../trace-model';
import { LogDetail } from './log-detail';

const MESSAGE_KEYS = ['message', 'body', 'exception.message', 'log.message'];
const SEVERITY_FILTERS: NonNullable<LogSeverity>[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
];

function detectBody(event: OtelEvent): unknown {
  for (const key of MESSAGE_KEYS) {
    const value = event.attributes[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function previewBody(body: unknown): string | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body;
  if (typeof body === 'number' || typeof body === 'boolean') {
    return String(body);
  }
  if (Array.isArray(body)) return `[${body.length} items]`;
  if (typeof body === 'object') {
    const keys = Object.keys(body as Record<string, unknown>);
    return keys.length === 0
      ? '{}'
      : `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
  }
  return null;
}

function LogListRow({
  event,
  spanStart,
  selected = false,
  onClick,
}: {
  readonly event: OtelEvent;
  readonly spanStart: number;
  readonly selected?: boolean;
  readonly onClick?: () => void;
}) {
  const severity = detectLogSeverity(event);
  const preview = previewBody(detectBody(event));
  const content = (
    <>
      <span
        className={cn(
          'mt-1 size-1.5 shrink-0 rounded-full',
          severity
            ? LOG_SEVERITY_DOT_CLASS[severity]
            : 'bg-muted-foreground/40',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {event.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
            +{formatDuration(event.timestamp - spanStart)}
          </span>
        </span>
        {preview && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {preview}
          </span>
        )}
      </span>
    </>
  );

  return onClick ? (
    <button
      className={cn(
        'flex w-full gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
        selected && 'bg-muted',
      )}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <span className="flex w-full gap-2.5 px-2 py-1.5 text-left">{content}</span>
  );
}

interface LogSectionProps {
  readonly logs: OtelEvent[];
  readonly spanStart: number;
  readonly spanName?: string;
}

export function LogSection({ logs, spanStart, spanName }: LogSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeSeverities, setActiveSeverities] = useState<
    Set<NonNullable<LogSeverity>>
  >(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);

  const enriched = useMemo(
    () =>
      logs.map((event, index) => ({
        event,
        index,
        severity: detectLogSeverity(event),
        body: detectBody(event),
      })),
    [logs],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return enriched.filter(({ event, severity, body }) => {
      if (
        activeSeverities.size > 0 &&
        (!severity || !activeSeverities.has(severity))
      ) {
        return false;
      }
      if (normalizedQuery.length === 0) return true;
      if (event.name.toLowerCase().includes(normalizedQuery)) return true;
      if (
        typeof body === 'string' &&
        body.toLowerCase().includes(normalizedQuery)
      ) {
        return true;
      }
      return Object.entries(event.attributes).some(
        ([key, value]) =>
          key.toLowerCase().includes(normalizedQuery) ||
          (typeof value === 'string' &&
            value.toLowerCase().includes(normalizedQuery)),
      );
    });
  }, [activeSeverities, enriched, query]);

  const selected =
    filtered.find(({ index }) => index === selectedIndex) ??
    filtered[0] ??
    null;

  const severityCounts = useMemo(() => {
    const counts: Record<NonNullable<LogSeverity>, number> = {
      trace: 0,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    for (const { severity } of enriched) {
      if (severity) counts[severity]++;
    }
    return counts;
  }, [enriched]);

  function toggleSeverity(severity: NonNullable<LogSeverity>) {
    setActiveSeverities((current) => {
      const next = new Set(current);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  }

  const selectedSeverity = selected ? detectLogSeverity(selected.event) : null;

  return (
    <>
      <button
        className="group flex w-full items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/10 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
        onClick={() => setDialogOpen(true)}
        type="button"
      >
        <span className="text-xs text-foreground">
          {logs.length} log{logs.length === 1 ? '' : 's'}
        </span>
        <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(760px,90vh)] w-[min(1100px,94vw)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]"
        >
          <DialogHeader className="flex flex-row items-center gap-3 border-b border-border px-5 py-3.5">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">
              Logs{spanName ? ` · ${spanName}` : ''}
            </DialogTitle>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {filtered.length === logs.length
                ? logs.length
                : `${filtered.length} / ${logs.length}`}
            </span>
            <Button
              aria-label="Close logs"
              className="shrink-0"
              onClick={() => setDialogOpen(false)}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon className="size-4" />
            </Button>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="relative min-w-56 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8 text-xs"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search logs"
                value={query}
              />
            </div>
            <div className="flex items-center gap-1">
              {SEVERITY_FILTERS.map((severity) => {
                const count = severityCounts[severity];
                if (count === 0) return null;
                const active = activeSeverities.has(severity);
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium uppercase tracking-wide transition-colors hover:bg-muted',
                      active && 'bg-muted',
                    )}
                    key={severity}
                    onClick={() => toggleSeverity(severity)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        LOG_SEVERITY_DOT_CLASS[severity],
                      )}
                    />
                    <span className={LOG_SEVERITY_LABEL_CLASS[severity]}>
                      {severity}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)] max-[720px]:grid-cols-1 max-[720px]:grid-rows-[minmax(180px,0.7fr)_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-r border-border p-2 max-[720px]:border-r-0 max-[720px]:border-b">
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No matching logs.
                </p>
              ) : (
                filtered.map(({ event, index }) => (
                  <LogListRow
                    event={event}
                    key={`${event.timestamp}:${event.name}:${index}`}
                    onClick={() => setSelectedIndex(index)}
                    selected={selected?.index === index}
                    spanStart={spanStart}
                  />
                ))
              )}
            </div>

            <div className="min-h-0 overflow-y-auto">
              {selected ? (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                    {selectedSeverity && (
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          LOG_SEVERITY_DOT_CLASS[selectedSeverity],
                        )}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                      {selected.event.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      +{formatDuration(selected.event.timestamp - spanStart)}
                    </span>
                  </div>
                  <div className="px-5 py-5">
                    <LogDetail
                      event={selected.event}
                      severityLabel={selectedSeverity?.toUpperCase() ?? null}
                      severityMeta={
                        selectedSeverity
                          ? {
                              dotClass:
                                LOG_SEVERITY_DOT_CLASS[selectedSeverity],
                              labelClass:
                                LOG_SEVERITY_LABEL_CLASS[selectedSeverity],
                            }
                          : null
                      }
                      size="roomy"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Select a log to inspect.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
