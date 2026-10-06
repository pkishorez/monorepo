import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import { type ReactNode, useMemo } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Glyph } from '../../components/glyph';
import { Text } from '../../components/text';
import { cn } from '../../theme';

// The web's row: Delete shows from 24 points, arms past 112, slides away in
// 180 ms; short of that it springs home.
const SHOW_AT = 24;
const DELETE_AT = 112;
const AWAY = { duration: 180, easing: Easing.bezier(0.4, 0, 1, 1) };
// Motion's `{ duration: 0.35, bounce: 0.15 }` and the label's `0.3, 0.45`.
const HOME = { duration: 350, dampingRatio: 0.85 } as const;
const POP = { duration: 300, dampingRatio: 0.55 } as const;

/**
 * A row one finger swipes left to delete, as on the web: Delete shows
 * behind it as it goes; past the line it arms, the tile deepening and its
 * label popping, and `onArm` hears it (for a sound and a buzz); let go
 * there, `onCommit` hears it, the row slides away and `onDelete` runs.
 * Short of the line, or
 * back from it, the row springs home. A screen reader gets Delete as the
 * row's action. Reduced motion keeps the drag but drops the pop and the
 * slide.
 *
 * ```tsx
 * <SwipeRow onDelete={() => remove(entry)} onArm={() => buzz()}>
 *   <EntryRow entry={entry} />
 * </SwipeRow>
 * ```
 */
export function SwipeRow(props: {
  /** Runs once the row has slid away, or Delete is chosen by a screen reader. */
  readonly onDelete: () => void;
  /** Runs each time the swipe goes past the line, so letting go deletes. */
  readonly onArm?: () => void;
  /** Runs as the row, let go past the line, starts to slide away. */
  readonly onCommit?: () => void;
  /** What the action says. Default `Delete`. */
  readonly label?: string;
  /** Extra classes for the row, such as its rounding. */
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const { onDelete, onArm, onCommit } = props;
  const label = props.label ?? 'Delete';
  const still = useReducedMotion();
  const x = useSharedValue(0);
  const width = useSharedValue(400);
  const armed = useSharedValue(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-12)
        .failOffsetX(12)
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
          'worklet';
          x.value = Math.min(0, event.translationX);
          const now = -x.value >= DELETE_AT;
          if (now === armed.value) return;
          armed.value = now;
          if (now && onArm !== undefined) scheduleOnRN(onArm);
        })
        .onEnd((_event, success) => {
          'worklet';
          // Taken from it (a Thumb Lock, say): onFinalize sends it home.
          if (!success) return;
          if (!armed.value) {
            x.value = still ? 0 : withSpring(0, HOME);
            return;
          }
          if (onCommit !== undefined) scheduleOnRN(onCommit);
          const gone = () => {
            'worklet';
            scheduleOnRN(onDelete);
          };
          if (still) {
            x.value = -width.value;
            gone();
            return;
          }
          x.value = withTiming(-width.value, AWAY, (done) => {
            'worklet';
            if (done) gone();
          });
        })
        .onFinalize((_event, success) => {
          'worklet';
          if (success) return;
          // Cancelled before it took the touch, or taken from it: home.
          armed.value = false;
          x.value = still ? 0 : withSpring(0, HOME);
        }),
    [onArm, onCommit, onDelete, still, x, width, armed],
  );

  const row = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const tile = useAnimatedStyle(() => ({
    opacity: interpolate(-x.value, [0, SHOW_AT], [0, 1], 'clamp'),
  }));
  const deeper = useAnimatedStyle(() => ({
    opacity: withTiming(armed.value ? 1 : 0, { duration: still ? 0 : 150 }),
  }));
  const pop = useAnimatedStyle(() => ({
    transform: [
      {
        scale: still ? 1 : withSpring(armed.value ? 1.15 : 1, POP),
      },
    ],
  }));

  const measure = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };

  return (
    <View
      accessibilityActions={[{ name: 'delete', label }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onDelete();
      }}
      onLayout={measure}
      className={cn('relative overflow-hidden rounded-lg', props.className)}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-0 flex-row items-center justify-end rounded-lg bg-destructive/10 pr-5"
        style={tile}
      >
        <Animated.View
          className="rounded-lg bg-destructive/10"
          style={[StyleSheet.absoluteFill, deeper]}
        />
        <Animated.View className="flex-row items-center gap-1.5" style={pop}>
          <Glyph icon={Delete02Icon} size={16} tone="destructive" />
          <Text weight="medium" className="text-sm text-destructive">
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View className="bg-background" style={row}>
          {props.children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
