import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Within } from '../../../logic/shared/index.ts';

const STATUS = {
  running: 'bg-running',
  waiting: 'bg-muted-foreground/50',
  finished: 'bg-muted-foreground/30',
  failed: 'bg-removed',
} as const;

export function WorkerChip({
  name,
  workerKey,
  within,
  status,
}: {
  readonly name: string;
  readonly workerKey?: string;
  readonly within: Within;
  readonly status?: keyof typeof STATUS;
}) {
  return (
    <span
      title={`${name}${workerKey ? ` · ${workerKey}` : ''} · ${within === 'state' ? 'only in this State' : 'in every State'}${status ? ` · ${status}` : ''}`}
      className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-sm px-2 text-xs text-muted-foreground"
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          STATUS[status ?? 'running'],
        )}
      />
      <span className="truncate">{name}</span>
      {workerKey && (
        <span className="truncate font-mono text-[10px] opacity-60">
          {workerKey}
        </span>
      )}
      {within === 'state' && (
        <span className="text-[10px] opacity-60">state</span>
      )}
    </span>
  );
}
