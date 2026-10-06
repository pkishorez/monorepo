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
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../theme';

// The fill grows from empty when it first shows and eases to each new value:
// the web's `transition-[width] duration-500` with its curve.
const GROW = { duration: 500, easing: Easing.bezier(0.4, 0, 0.2, 1) } as const;

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

const share = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const percent = (value: number) => `${share(value) * 100}%` as const;

export function Meter({ value, mark, tone = 'medium', className }: MeterProps) {
  const still = useReducedMotion();
  const target = share(value);
  const full = useSharedValue(still ? target : 0);
  useEffect(() => {
    full.value = still ? target : withTiming(target, GROW);
  }, [full, still, target]);
  const fill = useAnimatedStyle(() => ({ width: `${full.value * 100}%` }));
  return (
    <View
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <Animated.View
        className={cn('h-full rounded-full', TONES[tone])}
        style={fill}
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
