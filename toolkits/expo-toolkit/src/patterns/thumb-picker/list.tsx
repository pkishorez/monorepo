import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { TreeWalk } from '@kstackz/use-gesture';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Glyph } from '../../components/glyph';
import { Text } from '../../components/text';
import type { Choice } from './choice';
import type { Moves } from './motion';

/** How tall each row is, in points. */
export const ROW = 36;
/** The list's padding around its rows, in points. */
export const PAD = 4;

/**
 * Every choice of one list in order, the marked one under a highlight that
 * springs from row to row, a dot beside where the swipe began, and a
 * chevron on each choice with choices inside it, nudged toward them when
 * marked.
 */
export function List(props: {
  readonly choices: ReadonlyArray<Choice>;
  readonly marked: number;
  readonly here: number | undefined;
  readonly moves: Moves;
}) {
  const { marked, moves } = props;
  const top = useSharedValue(marked * ROW);
  useEffect(() => {
    top.value = moves.still
      ? marked * ROW
      : withSpring(marked * ROW, moves.row);
  }, [marked, moves, top]);
  const highlight = useAnimatedStyle(() => ({
    transform: [{ translateY: top.value }],
  }));

  return (
    <View style={{ padding: PAD }}>
      <Animated.View
        className="absolute rounded-[10px] bg-accent"
        style={[{ top: PAD, left: PAD, right: PAD, height: ROW }, highlight]}
      />
      {props.choices.map((choice, index) => {
        const isMarked = index === marked;
        return (
          <View
            key={choice.id}
            accessibilityState={{ selected: isMarked }}
            className="flex-row items-center gap-2.5 px-2.5"
            style={{ height: ROW }}
          >
            {choice.icon?.({ marked: isMarked })}
            <Text
              size="sm"
              weight={isMarked ? 'medium' : 'normal'}
              numberOfLines={1}
              className="flex-1"
            >
              {choice.label}
            </Text>
            {index === props.here && (
              <View
                accessibilityLabel="Where you are"
                className="size-1.5 rounded-full bg-muted-foreground"
              />
            )}
            {TreeWalk.opens(choice) && (
              <View
                accessibilityLabel="Has more inside"
                style={{ marginRight: -4, marginLeft: isMarked ? 2 : 0 }}
              >
                <Glyph
                  icon={ArrowRight01Icon}
                  size={14}
                  tone={isMarked ? 'foreground' : 'muted-foreground'}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
