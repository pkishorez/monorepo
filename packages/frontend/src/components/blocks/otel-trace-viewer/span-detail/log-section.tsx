import { useMemo, useState } from 'react';

import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  MaximizeIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { cn } from '#lib/utils';

import type { OtelEvent } from '../trace-model';
import { formatDuration } from '../trace-model';
import { LogDetail } from './log-detail';

type Severity = 'trace' | 'debug' | 'info' | 'warn' | 'error' | null;

const SEVERITY_KEYS = [
  'severity',
  'level',
  'log.severity',
  'log.level',
  'severityText',
  'log.severityText',
];
const MESSAGE_KEYS = ['message', 'body', 'exception.message', 'log.message'];

function severityFromNumber(n: number): Severity {
  if (n <= 0) return null;
  if (n <= 4) return 'trace';
  if (n <= 8) return 'debug';
  if (n <= 12) return 'info';
  if (n <= 16) return 'warn';
  return 'error';
}

export function detectSeverity(event: OtelEvent): Severity {
  if (event.name === 'exception') return 'error';
  for (const key of SEVERITY_KEYS) {
    const raw = event.attributes[key];
    if (typeof raw !== 'string') continue;
    const normalized = raw.toLowerCase().trim();
    if (normalized === 'trace') return 'trace';
    if (normalized === 'debug') return 'debug';
    if (normalized === 'info') return 'info';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    if (
      normalized === 'error' ||
      normalized === 'fatal' ||
      normalized === 'critical'
    )
      return 'error';
  }
  const num =
    event.attributes['severityNumber'] ??
    event.attributes['log.severityNumber'];
  if (typeof num === 'number') return severityFromNumber(num);
  return null;
}

function detectBody(event: OtelEvent): unknown {
  for (const key of MESSAGE_KEYS) {
    const raw = event.attributes[key];
    if (raw !== undefined && raw !== null && raw !== '') return raw;
  }
  return null;
}

function previewBody(body: unknown): string | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body;
  if (typeof body === 'number' || typeof body === 'boolean')
    return String(body);
  if (Array.isArray(body)) return `[${body.length} items]`;
  if (typeof body === 'object') {
    const keys = Object.keys(body as Record<string, unknown>);
    if (keys.length === 0) return '{}';
    return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
  }
  return null;
}

export const SEVERITY_DOT_CLASS: Record<NonNullable<Severity>, string> = {
  trace: 'bg-muted-foreground/40',
  debug: 'bg-muted-foreground/60',
  info: 'bg-sky-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
};

export const SEVERITY_LABEL_CLASS: Record<NonNullable<Severity>, string> = {
  trace: 'text-muted-foreground',
  debug: 'text-muted-foreground',
  info: 'text-sky-600 dark:text-sky-400',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

type LogRowSize = 'compact' | 'roomy';

interface LogRowProps {
  log: OtelEvent;
  spanStart: number;
  size?: LogRowSize;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

function LogRow({
  log,
  spanStart,
  size = 'compact',
  open: openProp,
  onOpenChange,
}: LogRowProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (onOpenChange) onOpenChange(value);
    else setInternalOpen(value);
  };
  const body = detectBody(log);
  const preview = previewBody(body);
  const hasAttrs = Object.keys(log.attributes).length > 0;
  const expandable = hasAttrs || (body !== null && typeof body === 'object');
  const relativeMs = log.timestamp - spanStart;
  const severity = detectSeverity(log);

  const roomy = size === 'roomy';
  const dotClass = severity
    ? SEVERITY_DOT_CLASS[severity]
    : 'bg-muted-foreground/40';

  return (
    <div className={cn('flex flex-col', roomy ? 'gap-2' : 'gap-1')}>
      <button
        onClick={() => expandable && setOpen((o) => !o)}
        disabled={!expandable}
        className={cn(
          'flex items-center text-left',
          roomy
            ? 'gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50'
            : 'gap-2 text-xs',
          expandable
            ? 'cursor-pointer text-foreground/80 hover:text-foreground'
            : 'cursor-default text-foreground/60',
        )}
      >
        <span
          className={cn(
            'shrink-0 rounded-full',
            roomy ? 'size-2.5' : 'size-1.5',
            dotClass,
          )}
        />
        {severity && (
          <span
            className={cn(
              'shrink-0 font-mono uppercase tracking-wider',
              roomy ? 'w-12 text-[11px] font-semibold' : 'w-10 text-[10px]',
              SEVERITY_LABEL_CLASS[severity],
            )}
          >
            {severity}
          </span>
        )}
        <span
          className={cn(
            'shrink-0 truncate font-mono text-foreground/80',
            roomy && 'text-[13px]',
          )}
        >
          {log.name}
        </span>
        {preview && (
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-muted-foreground',
              roomy && 'text-[13px]',
              body !== null && typeof body === 'object' && 'italic',
            )}
          >
            {preview}
          </span>
        )}
        {!preview && <span className="flex-1" />}
        <span
          className={cn(
            'shrink-0 tabular-nums text-muted-foreground/60',
            roomy ? 'text-xs' : 'text-[10px] text-muted-foreground/50',
          )}
        >
          +{formatDuration(relativeMs)}
        </span>
        {expandable && (
          <ChevronRightIcon
            className={cn(
              'shrink-0 text-muted-foreground/40 transition-transform',
              roomy ? 'size-4' : 'size-3',
              open && 'rotate-90',
            )}
          />
        )}
      </button>
      {open && expandable && (
        <div
          className={cn(
            'flex flex-col rounded-md bg-muted/30',
            roomy ? 'ml-5 gap-3 px-4 py-3' : 'ml-3.5 gap-2 px-2 py-1.5',
          )}
        >
          <LogDetail
            event={log}
            size={size}
            severityMeta={
              severity
                ? {
                    dotClass: SEVERITY_DOT_CLASS[severity],
                    labelClass: SEVERITY_LABEL_CLASS[severity],
                  }
                : null
            }
            severityLabel={severity}
          />
        </div>
      )}
    </div>
  );
}

interface LogSectionProps {
  logs: OtelEvent[];
  spanStart: number;
  spanName?: string;
}

const SEVERITY_FILTERS: NonNullable<Severity>[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
];

export function LogSection({ logs, spanStart, spanName }: LogSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeSeverities, setActiveSeverities] = useState<
    Set<NonNullable<Severity>>
  >(new Set());
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const enriched = useMemo(
    () =>
      logs.map((log) => ({
        log,
        severity: detectSeverity(log),
        body: detectBody(log),
      })),
    [logs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched
      .map((item, index) => ({ ...item, index }))
      .filter(({ log, severity, body }) => {
        if (activeSeverities.size > 0) {
          if (!severity || !activeSeverities.has(severity)) return false;
        }
        if (q.length === 0) return true;
        if (log.name.toLowerCase().includes(q)) return true;
        if (typeof body === 'string' && body.toLowerCase().includes(q))
          return true;
        for (const [k, v] of Object.entries(log.attributes)) {
          if (k.toLowerCase().includes(q)) return true;
          if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
        }
        return false;
      });
  }, [enriched, query, activeSeverities]);

  function toggleSeverity(sev: NonNullable<Severity>) {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  }

  function expandAll() {
    setOpenIndices(new Set(filtered.map((f) => f.index)));
  }

  function collapseAll() {
    setOpenIndices(new Set());
  }

  function setRowOpen(index: number, open: boolean) {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (open) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  const allExpanded =
    filtered.length > 0 && filtered.every((f) => openIndices.has(f.index));

  const severityCounts = useMemo(() => {
    const counts: Record<NonNullable<Severity>, number> = {
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

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDialogOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDialogOpen(true);
          }
        }}
        className="group flex w-full cursor-pointer flex-col gap-1 rounded-md border border-transparent text-left transition-colors hover:border-border hover:bg-muted/30"
      >
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70 group-hover:text-foreground/70">
            Click to open full view
          </span>
          <MaximizeIcon className="size-3.5 text-muted-foreground/60 group-hover:text-foreground" />
        </div>
        <div className="flex flex-col px-1 pb-1">
          {logs.map((log, i) => (
            <div key={i} className="pointer-events-none">
              <LogRow log={log} spanStart={spanStart} size="roomy" />
            </div>
          ))}
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[92vh] w-[96vw] max-w-[1600px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1600px]"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-sm font-medium">
              Logs{spanName ? ` · ${spanName}` : ''}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filtered.length === logs.length
                  ? `${logs.length} log${logs.length !== 1 ? 's' : ''}`
                  : `${filtered.length} / ${logs.length} logs`}
              </span>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDialogOpen(false)}
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name, body, or attribute…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              {SEVERITY_FILTERS.map((sev) => {
                const count = severityCounts[sev];
                const active = activeSeverities.has(sev);
                const disabled = count === 0;
                return (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    disabled={disabled}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors',
                      disabled && 'opacity-40',
                      active
                        ? 'border-foreground/20 bg-muted'
                        : 'border-transparent hover:bg-muted/60',
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        SEVERITY_DOT_CLASS[sev],
                      )}
                    />
                    <span className={SEVERITY_LABEL_CLASS[sev]}>{sev}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={allExpanded ? collapseAll : expandAll}
                className="h-8 gap-1.5 text-xs"
              >
                {allExpanded ? (
                  <ChevronsDownUpIcon className="size-3.5" />
                ) : (
                  <ChevronsUpDownIcon className="size-3.5" />
                )}
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
            {filtered.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                No logs match.
              </div>
            ) : (
              filtered.map(({ log, index }) => (
                <LogRow
                  key={index}
                  log={log}
                  spanStart={spanStart}
                  size="roomy"
                  open={openIndices.has(index)}
                  onOpenChange={(next) => setRowOpen(index, next)}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
