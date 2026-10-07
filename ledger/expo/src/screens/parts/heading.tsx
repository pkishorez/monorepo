import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { Glyph } from '@kstackz/expo-platform/components/glyph';
import { Text } from '@kstackz/expo-platform/components/text';
import { Pressable, View } from 'react-native';

/**
 * A part of a Place under its heading, with the way to all of it at the
 * end: "See all", "Its entries".
 */
export function Heading(props: {
  readonly title: string;
  readonly more?: { readonly label: string; readonly onPress: () => void };
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text weight="medium" accessibilityRole="header" className="text-sm">
        {props.title}
      </Text>
      {props.more && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={props.more.label}
          onPress={props.more.onPress}
          hitSlop={8}
          className="flex-row items-center gap-0.5 rounded-md active:opacity-60"
        >
          <Text muted className="text-sm">
            {props.more.label}
          </Text>
          <Glyph icon={ArrowRight01Icon} size={14} />
        </Pressable>
      )}
    </View>
  );
}
