import { Text } from '@kstackz/expo-toolkit/components/text';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/** A titled part of a Settings Section. */
export function Group(props: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View className="gap-1">
      <Text weight="semibold" className="text-base">
        {props.title}
      </Text>
      <View className="divide-y divide-border">{props.children}</View>
    </View>
  );
}

/** One setting: its name and what it does, and its control at the end. */
export function Row(props: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm">{props.label}</Text>
        {props.hint !== undefined && (
          <Text muted className="text-xs">
            {props.hint}
          </Text>
        )}
      </View>
      {props.children}
    </View>
  );
}

/** Two or three choices side by side, the chosen one filled. */
export function Flip<T extends string>(props: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
}) {
  return (
    <View className="flex-row rounded-lg bg-muted p-0.5">
      {props.options.map((option) => {
        const on = option.value === props.value;
        return (
          <Text
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(option.value)}
            className={
              on
                ? 'rounded-md bg-background px-3 py-1.5 text-sm text-foreground'
                : 'px-3 py-1.5 text-sm text-muted-foreground'
            }
          >
            {option.label}
          </Text>
        );
      })}
    </View>
  );
}
