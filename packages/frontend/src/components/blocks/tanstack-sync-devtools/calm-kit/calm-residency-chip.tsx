import { cn } from '#lib/utils';
import { RESIDENCY_STYLE, deriveResidency } from './collection-state';

const ACTIVE_STYLE = {
  label: 'active',
  text: 'text-chart-2',
  dot: 'bg-chart-2',
  border: 'border-chart-2',
  filled: true,
};

export function CalmResidencyChip({
  status,
  active,
}: {
  status: string;
  active: boolean;
}) {
  const style = active
    ? ACTIVE_STYLE
    : RESIDENCY_STYLE[deriveResidency(status)];

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className={cn(
          'size-1.5 rounded-full',
          style.filled ? style.dot : cn('border bg-transparent', style.border),
        )}
      />
      <span className={cn('text-[10px] tracking-wide lowercase', style.text)}>
        {style.label}
      </span>
    </span>
  );
}
