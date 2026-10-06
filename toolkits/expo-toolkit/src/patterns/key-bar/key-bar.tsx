import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../components/text';

// How long, in ms, a message stays, and how it comes and goes.
const SHOWN = 1400;
const ENTER = 180;
const LEAVE = 150;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * One bar at the foot of the screen, over the page so nothing beneath it
 * moves, that shows a message for a moment, such as what a tap just did. A
 * new message takes the old one's place at once, so two never show
 * together; only the last one fades as it goes. It never takes a touch, and
 * it only fades for those who ask for less motion.
 *
 * ```tsx
 * <KeyBar message={{ key: given.at, label: 'Add an entry' }} above={76} />
 * ```
 */
export function KeyBar(props: {
  /** What to show; a new `key` shows it again, even with the same label. */
  readonly message:
    | { readonly key: string | number; readonly label: string }
    | undefined;
  /** How far above the safe area's bottom it sits, in points. Default 20. */
  readonly above?: number;
}) {
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const [label, setLabel] = useState<string>();
  const shown = useSharedValue(0);
  const key = props.message?.key;
  const next = props.message?.label;

  // A new message shows at once; after a while it fades, unless replaced.
  useEffect(() => {
    if (key === undefined || next === undefined) return;
    setLabel(next);
    shown.value = 0;
    shown.value = withTiming(1, { duration: ENTER, easing: EASE });
    const timer = setTimeout(() => {
      shown.value = withTiming(0, { duration: LEAVE, easing: EASE });
    }, SHOWN);
    return () => clearTimeout(timer);
  }, [key, next, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: still
      ? []
      : [
          { translateY: (1 - shown.value) * 6 },
          { scale: 0.98 + shown.value * 0.02 },
        ],
  }));

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: insets.bottom + (props.above ?? 20) }}
    >
      {label !== undefined && (
        <Animated.View
          style={style}
          className="max-w-full rounded-lg border border-border bg-popover px-3 py-1.5 shadow-md"
        >
          <Text size="sm" className="text-popover-foreground">
            {label}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
