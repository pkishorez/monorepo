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
import { GestureZone } from '../../input';
import { turns } from './turns';

// A short drag or a light flick turns the page, as on the web: 60 points,
// or 300 points a second.
const TURN = { distance: 60, velocity: 300 } as const;
// The web's 0.15 s with no bounce; Reanimated's `duration` is the perceived one.
const SPRING = { duration: 150, dampingRatio: 1 } as const;

/**
 * Pages side by side, `page` in view and the others out of reach of touch
 * and screen readers. One finger swiping sideways drags them under it and,
 * let go far or fast enough, settles on the next page or the one before,
 * carrying the finger's speed; otherwise they spring back. They are a
 * Gesture Zone of their own, inside a GestureSurface, and take only a swipe
 * that turns a page: on the first page a swipe right, and on the last a
 * swipe left, go to the zones around them, such as a Sidebar's. A swipe
 * mostly up or down is left to the page's own scroll, and a second finger
 * (a Thumb Lock) to the others. A strip `edge` points wide along the left
 * edge is left alone, for an edge swipe. A page chosen another way (a tab)
 * slides into view; with reduced motion every move is a jump.
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
  readonly edge?: number;
  readonly children: ReactNode;
}) {
  const pages = Children.toArray(props.children);
  const last = pages.length - 1;
  const { page, onPage } = props;
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  // Which page is in view, in pages: 1.5 is halfway from the second to the third.
  const at = useSharedValue(page);
  // The page the pages are headed for, so a turn the swipe made itself is
  // not animated a second time when `page` catches up.
  const target = useSharedValue(page);
  const from = useSharedValue(page);
  const listener = useMemo(() => turns(), []);
  listener.at(page, last);

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
    // Only the ways a page turns: the Pan agrees with the zone's listener.
    const pan = Gesture.Pan().maxPointers(1).failOffsetY([-12, 12]);
    const sideways =
      page > 0 && page < last
        ? pan.activeOffsetX([-12, 12])
        : page < last
          ? pan.activeOffsetX(-12).failOffsetX(12)
          : pan.activeOffsetX(12).failOffsetX(-12);
    return sideways
      .hitSlop({ left: -(props.edge ?? 0) })
      .enabled(width > 0 && last > 0)
      .onStart(() => {
        'worklet';
        cancelAnimation(at);
        from.value = at.value;
      })
      .onUpdate((event) => {
        'worklet';
        const next = from.value - event.translationX / width;
        // Back past either end the pages give a little, rubber-banded.
        at.value =
          next < 0 ? next / 3 : next > last ? last + (next - last) / 3 : next;
      })
      .onEnd((event) => {
        'worklet';
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
  }, [width, page, last, still, onPage, props.edge, at, from, target]);

  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: -at.value * width }],
  }));

  const measure = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  return (
    <GestureZone listener={listener.listener} style={styles.frame}>
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
    </GestureZone>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  track: { flex: 1, flexDirection: 'row' },
});
