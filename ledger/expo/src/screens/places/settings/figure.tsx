import type { Motion, Way } from '@ledger/core/client/commands';
import { cn } from '@kstackz/expo-toolkit/theme';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// How far, in points, the finger travels in a figure.
const TRAVEL = 14;

const STEP: Readonly<Record<Way, { readonly x: number; readonly y: number }>> =
  {
    up: { x: 0, y: -TRAVEL },
    down: { x: 0, y: TRAVEL },
    left: { x: -TRAVEL, y: 0 },
    right: { x: TRAVEL, y: 0 },
  };

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * A gesture, drawn small: fingers as dots on a screen, as on the web. It
 * plays once as it is drawn and again on a tap, and stands still for those
 * who ask for less motion. A Thumb Lock shows the resting thumb at the
 * left, ringed, and the finger that swipes.
 */
export function GestureFigure(props: {
  readonly motion: Motion;
  readonly large?: boolean;
}) {
  const { motion } = props;
  const still = useReducedMotion();
  // 0 at rest, 1 moved; the finger fades while it comes back.
  const moved = useSharedValue(0);
  const shown = useSharedValue(1);
  const play = () => {
    if (still || motion.kind === 'tap') {
      shown.value = withSequence(
        withTiming(0.3, { duration: 150 }),
        withTiming(1, { duration: 250 }),
      );
      return;
    }
    moved.value = withSequence(
      withDelay(200, withTiming(1, { duration: 450, easing: EASE })),
      withDelay(500, withTiming(0, { duration: 0 })),
    );
    shown.value = withSequence(
      withDelay(1000, withTiming(0, { duration: 150 })),
      withTiming(1, { duration: 200 }),
    );
  };
  useEffect(play, []);

  const way = motion.kind === 'tap' ? undefined : STEP[motion.way];
  const finger = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: (way?.x ?? 0) * moved.value },
      { translateY: (way?.y ?? 0) * moved.value },
    ],
  }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: 22 * moved.value }],
  }));

  return (
    <Pressable
      onPress={play}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-muted/50',
        props.large ? 'size-16' : 'size-12',
      )}
    >
      {motion.kind === 'thumb' && (
        <View className="absolute bottom-2 left-2 size-3 rounded-full border-4 border-foreground/10 bg-foreground/30" />
      )}
      {motion.kind === 'drag' && (
        <Animated.View
          style={sheet}
          className="absolute inset-x-1.5 top-4 bottom-0 rounded-t-md border border-b-0 border-border bg-background"
        />
      )}
      <Animated.View
        style={finger}
        className={cn(
          'absolute size-3 rounded-full bg-foreground/70',
          motion.kind === 'thumb'
            ? props.large
              ? 'top-[26px] left-[34px]'
              : 'top-[18px] left-[26px]'
            : props.large
              ? 'top-[26px] left-[26px]'
              : 'top-[18px] left-[18px]',
        )}
      />
    </Pressable>
  );
}
