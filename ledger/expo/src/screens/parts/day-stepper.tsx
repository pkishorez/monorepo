import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import { Button } from '@kstackz/expo-platform/components/button';
import { Glyph } from '@kstackz/expo-platform/components/glyph';
import { Text } from '@kstackz/expo-platform/components/text';
import { dayName, shiftDay, today } from '@ledger/core/model';
import { View } from 'react-native';
import { useToneOf } from './tone';

/**
 * A day, a step at a time: the day before, or after, never past today.
 * Stands in for the web's date field.
 */
export function DayStepper(props: {
  readonly value: string;
  readonly onChange: (day: string) => void;
}) {
  const latest = props.value >= today();
  const toneOf = useToneOf();
  return (
    <View className="h-9 flex-row items-center rounded-full border border-border">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        accessibilityLabel="The day before"
        onPress={() => props.onChange(shiftDay(props.value, -1))}
      >
        <Glyph icon={ArrowLeft01Icon} size={16} tone="foreground" />
      </Button>
      <Text
        className="min-w-24 text-center text-sm"
        accessibilityLabel={`Day: ${dayName(props.value)}`}
      >
        {dayName(props.value)}
      </Text>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        accessibilityLabel="The day after"
        disabled={latest}
        onPress={() => props.onChange(shiftDay(props.value, 1))}
      >
        <Glyph icon={ArrowRight01Icon} size={16} color={toneOf(!latest)} />
      </Button>
    </View>
  );
}
