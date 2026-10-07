import type { TreeWalk } from '@kstackz/use-gesture';
import { BlurView } from 'expo-blur';
import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Choice } from './choice';
import { List, ROW } from './list';
import { BEHIND, type Moves, SHAKE, useMoves, WIDTH } from './motion';
import { placeIn, type View as Shown } from './view';

type Props = {
  /** Every list the walk can open, each before the lists inside it. */
  readonly lists: ReadonlyArray<TreeWalk.List<Choice>>;
  readonly view: SharedValue<Shown>;
  /** Counts up once for each Wrong Way. */
  readonly shakes: SharedValue<number>;
};

/**
 * Where letting go will take you, at the top centre of the screen and
 * never under the fingers, over everything else dimmed and, on iOS,
 * blurred: the open list in the middle, and each list it was opened from
 * drawn back to the top left, smaller and fainter. It zooms in as it shows;
 * an opened list slides in from the right and slides back out as the swipe
 * goes back. Each time `shakes` counts up, the menu shakes once. None of it
 * moves for those who ask for less motion. It never takes a touch.
 *
 * Every list is drawn up front, hidden, and drawn again only when the
 * lists change: `view`, written on the UI thread, moves all of it there.
 */
export const Menu = memo(function Menu(props: Props) {
  const { view, shakes } = props;
  const moves = useMoves();
  const insets = useSafeAreaInsets();

  const seen = useSharedValue(0);
  const scale = useSharedValue(1);
  useAnimatedReaction(
    () => view.value.shown,
    (shown, was) => {
      if (shown === was || was === null) return;
      const timing = { duration: moves.fade, easing: moves.ease };
      if (shown) scale.value = 0.94;
      scale.value = withTiming(shown ? 1 : 0.97, timing);
      seen.value = withTiming(shown ? 1 : 0, timing);
    },
  );
  const shake = useSharedValue(0);
  useAnimatedReaction(
    () => shakes.value,
    (count, was) => {
      if (was === null || count === was || moves.still) return;
      const each = SHAKE.duration / SHAKE.at.length;
      shake.value = withSequence(
        ...SHAKE.at.map((x) => withTiming(x, { duration: each })),
      );
    },
  );

  const scrim = useAnimatedStyle(() => ({ opacity: seen.value }));
  const menu = useAnimatedStyle(() => ({
    opacity: seen.value,
    transform: [{ scale: scale.value }],
  }));
  const shaking = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={12} style={StyleSheet.absoluteFill} />
        )}
        <View className="absolute inset-0 bg-black/40" />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: insets.top + 96,
            left: '50%',
            transformOrigin: 'top',
          },
          menu,
        ]}
      >
        <Animated.View style={shaking}>
          {props.lists.map((list) => (
            <Column
              key={list.id}
              list={list}
              view={view}
              moves={moves}
              root={list.id === ''}
            />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
});

// One list: in front while it is the open one, drawn back to the top left
// for each open list in front of it, and slid out to the right while it is
// not open. The top list is never slid out; the menu fades with it.
function Column(props: {
  readonly list: TreeWalk.List<Choice>;
  readonly view: SharedValue<Shown>;
  readonly moves: Moves;
  readonly root: boolean;
}) {
  const { list, view, moves, root } = props;
  // How many open lists sit in front of it.
  const place = useSharedValue(0);
  // 0 while open, 1 slid out.
  const out = useSharedValue(root ? 0 : 1);
  const marked = useSharedValue(0);
  const top = useSharedValue(0);
  useAnimatedReaction(
    () => view.value,
    (now, was) => {
      const at = placeIn(now, list.id);
      // While the menu was hidden, everything jumps into place; the UI
      // thread may have written several Views since this last ran.
      const jump = was?.shown !== true || moves.still;
      const spring = (to: number, how: Moves['row']) =>
        jump ? to : withSpring(to, how);
      if (at === undefined) {
        if (!root) out.value = spring(1, moves.slide);
        return;
      }
      if (at.marked !== marked.value || jump) {
        top.value = spring(at.marked * ROW, moves.row);
      }
      marked.value = at.marked;
      place.value = spring(at.back, moves.slide);
      out.value = spring(0, moves.slide);
    },
  );
  const style = useAnimatedStyle(() => ({
    opacity:
      (1 - Math.min(place.value, 1) * 0.5) * (1 - Math.min(out.value, 1)),
    transform: [
      { translateX: place.value * BEHIND.x + out.value * 56 },
      { translateY: place.value * BEHIND.y },
      { scale: (1 - place.value * 0.1) * (1 - out.value * 0.04) },
    ],
  }));
  return (
    <View
      style={{ position: 'absolute', top: 0, left: -WIDTH / 2, width: WIDTH }}
    >
      <Animated.View
        className="rounded-2xl border border-border bg-popover shadow-lg"
        style={[{ transformOrigin: 'top left' }, style]}
      >
        <List
          choices={list.choices}
          here={list.here}
          marked={marked}
          top={top}
        />
      </Animated.View>
    </View>
  );
}
