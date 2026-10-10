import type { Row } from '../step/index.ts';

const LIFE = {
  started: 'bg-positive/10 text-positive',
  stopped: 'bg-destructive/10 text-destructive',
} as const;

/** Which Instance a Row is: its Actor, its key, and whether the Step started or stopped it. */
export const Who = ({
  row,
  children,
}: {
  readonly row: Row;
  /** Anything else on the line, like its State. */
  readonly children?: React.ReactNode;
}) => {
  const { instance, life } = row;
  return (
    <div className="flex min-w-0 items-center gap-2" title={instance.id}>
      <span
        className={`truncate text-[13px] font-medium ${life === 'stopped' ? 'text-muted-foreground line-through' : ''}`}
      >
        {instance.actor}
      </span>
      {instance.key !== undefined && (
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {instance.key}
        </span>
      )}
      {children}
      {life !== 'kept' && (
        <span
          className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${LIFE[life]}`}
        >
          {life === 'started' ? 'Started' : 'Stopped'}
        </span>
      )}
    </div>
  );
};
