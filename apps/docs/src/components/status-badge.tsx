const styles = {
  alpha:
    'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10',
  soon: 'border-border text-muted-foreground bg-muted/50',
} as const;

export type PackageStatus = keyof typeof styles;

export function StatusBadge({ status }: { status: PackageStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}
