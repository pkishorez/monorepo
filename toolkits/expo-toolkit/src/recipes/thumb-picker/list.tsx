import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { TreeWalk } from '@kstackz/use-gesture';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Glyph } from '../../components/glyph';
import { Text } from '../../components/text';
import type { Choice } from './choice';

/** How tall each row is, in points. */
export const ROW = 36;
/** The list's padding around its rows, in points. */
export const PAD = 4;

/**
 * Every choice of one list in order, the marked one under a highlight that
 * moves from row to row (`top`, in points), a dot beside where the swipe
 * began, and a chevron on each choice with choices inside it, nudged toward
 * them when marked. Each row is drawn once both ways, plain and marked, and
 * `marked` shows one of them, so a Step draws nothing new.
 */
export const List = memo(function List(props: {
  readonly choices: ReadonlyArray<Choice>;
  readonly here: number | undefined;
  readonly marked: SharedValue<number>;
  readonly top: SharedValue<number>;
}) {
  const { top } = props;
  const highlight = useAnimatedStyle(() => ({
    transform: [{ translateY: top.value }],
  }));
  return (
    <View style={{ padding: PAD }}>
      <Animated.View
        className="absolute rounded-[10px] bg-accent"
        style={[{ top: PAD, left: PAD, right: PAD, height: ROW }, highlight]}
      />
      {props.choices.map((choice, index) => (
        <Row
          key={choice.id}
          choice={choice}
          index={index}
          here={index === props.here}
          marked={props.marked}
        />
      ))}
    </View>
  );
});

function Row(props: {
  readonly choice: Choice;
  readonly index: number;
  readonly here: boolean;
  readonly marked: SharedValue<number>;
}) {
  const { index, marked } = props;
  const plain = useAnimatedStyle(() => ({
    opacity: marked.value === index ? 0 : 1,
  }));
  const bright = useAnimatedStyle(() => ({
    opacity: marked.value === index ? 1 : 0,
  }));
  return (
    <View style={{ height: ROW }}>
      <Animated.View style={[StyleSheet.absoluteFill, plain]}>
        <Face choice={props.choice} here={props.here} marked={false} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, bright]}>
        <Face choice={props.choice} here={props.here} marked />
      </Animated.View>
    </View>
  );
}

// One row as it looks plain or marked.
function Face(props: {
  readonly choice: Choice;
  readonly here: boolean;
  readonly marked: boolean;
}) {
  const { choice, marked } = props;
  return (
    <View
      className="flex-row items-center gap-2.5 px-2.5"
      style={{ height: ROW }}
    >
      {choice.icon?.({ marked })}
      <Text
        size="sm"
        weight={marked ? 'medium' : 'normal'}
        numberOfLines={1}
        className="flex-1"
      >
        {choice.label}
      </Text>
      {props.here && (
        <View
          accessibilityLabel="Where you are"
          className="size-1.5 rounded-full bg-muted-foreground"
        />
      )}
      {TreeWalk.opens(choice) && (
        <View
          accessibilityLabel="Has more inside"
          style={{ marginRight: -4, marginLeft: marked ? 2 : 0 }}
        >
          <Glyph
            icon={ArrowRight01Icon}
            size={14}
            tone={marked ? 'foreground' : 'muted-foreground'}
          />
        </View>
      )}
    </View>
  );
}
