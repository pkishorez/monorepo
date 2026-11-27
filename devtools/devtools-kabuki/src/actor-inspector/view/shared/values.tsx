import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { DiffViewer } from '@kestack/web-platform/ui/viewers/diff-viewer';
import { JsonViewer } from '@kestack/web-platform/ui/viewers/json';
import { jsonDiff } from '../../logic/shared/index.ts';
import type { BeforeAfter } from '../../logic/shared/index.ts';

const EPOCH = 1_000_000_000_000;

const YEAR_2100 = 4_102_444_800_000;

const isTime = (value: number) =>
  Number.isInteger(value) && value > EPOCH && value < YEAR_2100;

const COPYABLE = 16;

const CONFIRM = 1500;

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const SKIPPED_ITEMS = /^…(\d+) more$/;
const SKIPPED_KEYS = /^(\d+) more keys$/;

const skippedBy = (pattern: RegExp, one: unknown) => {
  const match = typeof one === 'string' ? pattern.exec(one) : null;
  return match ? Number(match[1]) - 1 : 0;
};

const countOf = (value: object) => {
  const count = Array.isArray(value)
    ? value.reduce<number>(
        (sum, one) => sum + skippedBy(SKIPPED_ITEMS, one),
        value.length,
      )
    : Object.keys(value).length +
      skippedBy(SKIPPED_KEYS, (value as Record<string, unknown>)['…']);
  const noun = Array.isArray(value) ? 'item' : 'field';
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
};

export function Copy({
  text,
  label,
  className,
}: {
  readonly text: string;
  readonly label: string;
  readonly className?: string;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), CONFIRM);
    return () => clearTimeout(timer);
  }, [done]);
  const Icon = done ? CheckIcon : CopyIcon;
  return (
    <button
      type="button"
      aria-label={done ? `Copied ${label}` : `Copy ${label}`}
      title={done ? 'Copied' : 'Copy'}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => setDone(true));
      }}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-[color,opacity] duration-150 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-ring motion-reduce:transition-none',
        done && 'text-foreground opacity-100',
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
    </button>
  );
}

export function JsonDialog({
  open,
  onOpenChange,
  title,
  pair,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly pair: BeforeAfter;
}) {
  const both = 'before' in pair && 'after' in pair;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-[13px]">{title}</DialogTitle>
          <DialogDescription>
            {both
              ? 'What this Step changed, line by line'
              : 'after' in pair
                ? 'Its value at this Step'
                : 'What this Step removed'}
          </DialogDescription>
        </DialogHeader>
        {both ? (
          <div className="max-h-[60vh] min-w-0 overflow-auto rounded-md border border-border">
            <DiffViewer
              diff={jsonDiff(pair.before, pair.after)}
              defaultLayout="unified"
              showToolbar={false}
              autoHeight
            />
          </div>
        ) : (
          <JsonViewer
            label={'after' in pair ? 'Value' : 'Removed'}
            value={'after' in pair ? pair.after : pair.before}
            maxHeight="60vh"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Opener({
  title,
  pair,
  className,
  children,
}: {
  readonly title: string;
  readonly pair: BeforeAfter;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={className}
      >
        {children}
      </button>
      <JsonDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        pair={pair}
      />
    </>
  );
}

export function Value({
  value,
  label,
  pair,
  still = false,
  className,
}: {
  readonly value: unknown;
  readonly label: string;
  readonly pair?: BeforeAfter;
  readonly still?: boolean;
  readonly className?: string;
}) {
  const whole = pair ?? { after: value };
  if (value === undefined)
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  if (typeof value === 'object' && value !== null && still)
    return (
      <span
        className={cn(
          'min-w-0 shrink-0 truncate text-muted-foreground',
          className,
        )}
      >
        {Array.isArray(value) ? '[…]' : '{…}'} {countOf(value)}
      </span>
    );
  if (typeof value === 'object' && value !== null)
    return (
      <Opener
        title={label}
        pair={whole}
        className={cn(
          'min-w-0 shrink-0 truncate text-left text-muted-foreground decoration-dotted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ring',
          className,
        )}
      >
        {Array.isArray(value) ? '[…]' : '{…}'} {countOf(value)}
      </Opener>
    );
  if (typeof value === 'number')
    return (
      <span
        title={isTime(value) ? new Date(value).toISOString() : undefined}
        className={cn('tabular-nums', className)}
      >
        {isTime(value) ? time(value) : value}
      </span>
    );
  if (typeof value === 'boolean' || value === null)
    return (
      <span
        className={cn(
          'tabular-nums',
          value === null && 'text-muted-foreground',
          className,
        )}
      >
        {String(value)}
      </span>
    );
  const text = String(value);
  if (text === '')
    return <span className={cn('text-muted-foreground', className)}>""</span>;
  return (
    <span
      className={cn('group/value flex min-w-0 items-center gap-1', className)}
    >
      <span title={text} className="min-w-0 truncate">
        {text}
      </span>
      {text.length > COPYABLE && !still && (
        <Copy
          text={text}
          label={label}
          className="opacity-0 group-hover/value:opacity-100 touch:opacity-100"
        />
      )}
    </span>
  );
}
