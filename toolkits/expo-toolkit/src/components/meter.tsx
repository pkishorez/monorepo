/**
 * Meter: how full something is, as a thin rounded bar on the muted track —
 * a budget spent, one month against the biggest. The toolkit's own, not a
 * Panel UI copy.
 *
 * ```tsx
 * <Meter value={spent / budget} tone={spent > budget ? 'destructive' : 'strong'} />
 * <Meter value={cents / most} mark={budget / most} />
 * ```
 */
import { View } from 'react-native';
import { cn } from '../theme';

const TONES = {
  strong: 'bg-foreground',
  medium: 'bg-foreground/70',
  soft: 'bg-muted-foreground/50',
  destructive: 'bg-destructive',
} as const;

export interface MeterProps {
  /** How full, from 0 to 1; anything past 1 shows full. */
  value: number;
  /** A line across the bar at this point, from 0 to 1, as a limit. */
  mark?: number;
  /** The fill's colour. Default `medium`. */
  tone?: keyof typeof TONES;
  /** Extra classes for the track, such as its height. Default `h-1.5`. */
  className?: string;
}

const percent = (value: number) =>
  `${Math.max(0, Math.min(1, value)) * 100}%` as const;

export function Meter({ value, mark, tone = 'medium', className }: MeterProps) {
  return (
    <View
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <View
        className={cn('h-full rounded-full', TONES[tone])}
        style={{ width: percent(value) }}
      />
      {mark !== undefined && (
        <View
          className="absolute inset-y-0 w-0.5 bg-foreground/60"
          style={{ left: percent(mark) }}
        />
      )}
    </View>
  );
}
