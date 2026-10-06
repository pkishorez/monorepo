import type { TreeWalk } from '@kstackz/use-gesture';
import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type EntryExitAnimationFunction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Choice } from './choice';
import { List } from './list';
import { BEHIND, type Moves, SHAKE, useMoves, WIDTH } from './motion';

type Column = TreeWalk.Column<Choice>;

/**
 * Where letting go will take you, at the top centre of the screen and
 * never under the fingers, over everything else dimmed and blurred: the
 * open list in the middle, and each list it was opened from drawn back to
 * the top left, smaller and fainter. It zooms in as it shows; an opened
 * list slides in from the right and slides back out as the swipe goes
 * back. Each time `shakes` counts up, the menu shakes once. None of it
 * moves for those who ask for less motion. It never takes a touch.
 */
export function Menu(props: {
  readonly columns: ReadonlyArray<Column> | undefined;
  readonly shakes: number;
}) {
  const moves = useMoves();
  const insets = useSafeAreaInsets();
  const shake = useSharedValue(0);
  useEffect(() => {
    if (props.shakes === 0 || moves.still) return;
    const each = SHAKE.duration / SHAKE.at.length;
    shake.value = withSequence(
      ...SHAKE.at.map((x) => withTiming(x, { duration: each })),
    );
  }, [props.shakes, moves.still, shake]);
  const shaking = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const columns = props.columns;
  const last = (columns?.length ?? 0) - 1;
  // Always mounted, so the scrim and the menu can fade out as they go.
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {columns !== undefined && (
        <Animated.View
          entering={zoomIn(moves)}
          exiting={zoomOut(moves)}
          style={StyleSheet.absoluteFill}
        >
          <BlurView intensity={12} style={StyleSheet.absoluteFill} />
          <View className="absolute inset-0 bg-black/40" />
        </Animated.View>
      )}
      {columns !== undefined && (
        <Animated.View
          accessibilityLiveRegion="polite"
          entering={zoomIn(moves, 0.94)}
          exiting={zoomOut(moves, 0.97)}
          style={{
            position: 'absolute',
            top: insets.top + 96,
            left: '50%',
            transformOrigin: 'top',
          }}
        >
          <Animated.View style={shaking}>
            {columns.map((column, depth) => (
              <ColumnView
                key={column.id}
                column={column}
                back={last - depth}
                opened={depth > 0}
                moves={moves}
              />
            ))}
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// One list, `back` lists behind the open one.
function ColumnView(props: {
  readonly column: Column;
  readonly back: number;
  readonly opened: boolean;
  readonly moves: Moves;
}) {
  const { back, moves } = props;
  const place = useSharedValue(back);
  useEffect(() => {
    place.value = moves.still ? back : withSpring(back, moves.slide);
  }, [back, moves, place]);
  const behind = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(place.value, 1) * 0.5,
    transform: [
      { translateX: place.value * BEHIND.x },
      { translateY: place.value * BEHIND.y },
      { scale: 1 - place.value * 0.1 },
    ],
  }));
  return (
    <Animated.View
      entering={props.opened ? slideIn(moves) : undefined}
      exiting={slideOut(moves)}
      style={{
        position: 'absolute',
        top: 0,
        left: -WIDTH / 2,
        width: WIDTH,
        zIndex: 10 - back,
      }}
    >
      <Animated.View
        className="rounded-2xl border border-border bg-popover shadow-lg"
        style={[{ transformOrigin: 'top left' }, behind]}
      >
        <List
          choices={props.column.choices}
          marked={props.column.marked}
          here={props.column.here}
          moves={moves}
        />
      </Animated.View>
    </Animated.View>
  );
}

// Shows from `scale` and clear; at once for less motion.
const zoomIn =
  (moves: Moves, scale = 1): EntryExitAnimationFunction =>
  () => {
    'worklet';
    const timing = { duration: moves.fade, easing: moves.ease };
    return {
      initialValues: { opacity: 0, transform: [{ scale }] },
      animations: {
        opacity: withTiming(1, timing),
        transform: [{ scale: withTiming(1, timing) }],
      },
    };
  };

const zoomOut =
  (moves: Moves, scale = 1): EntryExitAnimationFunction =>
  () => {
    'worklet';
    const timing = { duration: moves.fade, easing: moves.ease };
    return {
      initialValues: { opacity: 1, transform: [{ scale: 1 }] },
      animations: {
        opacity: withTiming(0, timing),
        transform: [{ scale: withTiming(scale, timing) }],
      },
    };
  };

// An opened list slides in from the right, and back out to it.
const slideIn =
  (moves: Moves): EntryExitAnimationFunction =>
  () => {
    'worklet';
    const spring = moves.still ? { duration: 0 } : moves.slide;
    return {
      initialValues: {
        opacity: 0,
        transform: [{ translateX: 56 }, { scale: 0.96 }],
      },
      animations: {
        opacity: withTiming(1, { duration: moves.fade }),
        transform: [
          { translateX: withSpring(0, spring) },
          { scale: withSpring(1, spring) },
        ],
      },
    };
  };

const slideOut =
  (moves: Moves): EntryExitAnimationFunction =>
  () => {
    'worklet';
    const spring = moves.still ? { duration: 0 } : moves.slide;
    return {
      initialValues: {
        opacity: 1,
        transform: [{ translateX: 0 }, { scale: 1 }],
      },
      animations: {
        opacity: withTiming(0, { duration: moves.fade }),
        transform: [
          { translateX: withSpring(56, spring) },
          { scale: withSpring(0.96, spring) },
        ],
      },
    };
  };
