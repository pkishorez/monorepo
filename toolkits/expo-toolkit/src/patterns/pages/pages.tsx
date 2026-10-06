import { Children, type ReactNode, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// A short drag or a light flick turns the page, as on the web: 60 points,
// or 300 points a second.
const TURN = { distance: 60, velocity: 300 } as const;
// The web's 0.15 s with no bounce; Reanimated's `duration` is the perceived one.
const SPRING = { duration: 150, dampingRatio: 1 } as const;

/**
 * A drag a swipe hands on: how far right the finger has gone, in points,
 * and, as it lifts, how far and how fast (points a second). Both run on the
 * UI thread, so they must be worklets.
 */
type Drag = {
  readonly move: (offset: number) => void;
  readonly end: (offset: number, velocity: number) => void;
};

/**
 * Pages side by side, `page` in view and the others out of reach of touch
 * and screen readers. One finger swiping sideways drags them under it and,
 * let go far or fast enough, settles on the next page or the one before,
 * carrying the finger's speed; otherwise they spring back. A swipe mostly
 * up or down is left to the page's own scroll, and a second finger (a Thumb
 * Lock) to the others. On the first page a swipe right is handed to
 * `beforeFirst`, such as a Sidebar's open, if there is one. A strip `edge`
 * points wide along the left edge is left alone, for an edge swipe. A page
 * chosen another way (a tab) slides into view; with reduced motion every
 * move is a jump.
 *
 * ```tsx
 * <Pages page={at} onPage={setAt}>
 *   <General />
 *   <Gestures />
 * </Pages>
 * ```
 */
export function Pages(props: {
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly beforeFirst?: Drag;
  readonly edge?: number;
  readonly children: ReactNode;
}) {
  const pages = Children.toArray(props.children);
  const last = pages.length - 1;
  const { page, onPage, beforeFirst } = props;
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  // Which page is in view, in pages: 1.5 is halfway from the second to the third.
  const at = useSharedValue(page);
  // The page the pages are headed for, so a turn the swipe made itself is
  // not animated a second time when `page` catches up.
  const target = useSharedValue(page);
  const from = useSharedValue(page);
  const handing = useSharedValue(false);

  useEffect(() => {
    if (target.value === page) return;
    target.value = page;
    at.value = still
      ? withTiming(page, { duration: 0 })
      : withSpring(page, SPRING);
  }, [page, still, at, target]);

  const gesture = useMemo(() => {
    const settle = (to: number, velocity: number) => {
      'worklet';
      target.value = to;
      at.value = still
        ? withTiming(to, { duration: 0 })
        : withSpring(to, { ...SPRING, velocity });
    };
    return Gesture.Pan()
      .maxPointers(1)
      .activeOffsetX([-12, 12])
      .failOffsetY([-12, 12])
      .hitSlop({ left: -(props.edge ?? 0) })
      .enabled(width > 0)
      .onStart(() => {
        'worklet';
        cancelAnimation(at);
        from.value = at.value;
        handing.value = false;
      })
      .onUpdate((event) => {
        'worklet';
        const next = from.value - event.translationX / width;
        if (beforeFirst !== undefined && (handing.value || next < 0)) {
          handing.value = true;
          at.value = 0;
          beforeFirst.move(Math.max(0, event.translationX));
          return;
        }
        // Past either end the pages give a little, rubber-banded.
        at.value =
          next < 0 ? next / 3 : next > last ? last + (next - last) / 3 : next;
      })
      .onEnd((event) => {
        'worklet';
        if (handing.value) {
          handing.value = false;
          beforeFirst?.end(Math.max(0, event.translationX), event.velocityX);
          return;
        }
        // Positive toward later pages.
        const moved = -event.translationX;
        const speed = -event.velocityX;
        const base = Math.round(from.value);
        const way =
          moved >= TURN.distance || speed >= TURN.velocity
            ? 1
            : -moved >= TURN.distance || -speed >= TURN.velocity
              ? -1
              : 0;
        const to = Math.min(last, Math.max(0, base + way));
        settle(to, speed / width);
        if (to !== base) scheduleOnRN(onPage, to);
      });
  }, [
    width,
    last,
    still,
    beforeFirst,
    onPage,
    props.edge,
    at,
    from,
    handing,
    target,
  ]);

  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: -at.value * width }],
  }));

  const measure = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} onLayout={measure} style={styles.frame}>
        <Animated.View
          style={[styles.track, { width: width * pages.length }, track]}
        >
          {pages.map((each, index) => {
            const away = index !== page;
            return (
              <View
                key={index}
                pointerEvents={away ? 'none' : 'auto'}
                accessibilityElementsHidden={away}
                importantForAccessibility={
                  away ? 'no-hide-descendants' : 'auto'
                }
                style={{ width }}
              >
                {each}
              </View>
            );
          })}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  track: { flex: 1, flexDirection: 'row' },
});
