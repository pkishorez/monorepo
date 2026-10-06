import { Text } from '@kstackz/expo-toolkit/components/text';
import { cn } from '@kstackz/expo-toolkit/theme';
import type { Account, Category, Entry } from '@ledger/core/shared/ledger';
import { Pressable, View } from 'react-native';
import { Amount } from './amount';
import { CategoryIcon } from './icons';

/**
 * One Entry in a list: its Category, memo and Account, and the amount.
 * `marked` is the one Jump came back to.
 */
export function EntryRow(props: {
  readonly entry: Entry;
  readonly category: Category | undefined;
  readonly account: Account | undefined;
  readonly currency: string;
  readonly marked?: boolean;
  readonly onPress?: () => void;
}) {
  const { entry, category, account } = props;
  const title = entry.memo || category?.name || 'Entry';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: props.marked === true }}
      onPress={props.onPress}
      className={cn(
        'min-h-14 flex-row items-center gap-3 rounded-lg bg-background px-3 py-2.5 active:bg-muted',
        props.marked && 'bg-muted',
      )}
    >
      <CategoryIcon icon={category?.icon} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm">
          {title}
        </Text>
        <Text muted numberOfLines={1} className="text-xs">
          {category?.name ?? 'No category'} · {account?.name ?? 'No account'}
        </Text>
      </View>
      <Amount
        cents={entry.cents}
        way={entry.way}
        currency={props.currency}
        className="text-sm"
      />
    </Pressable>
  );
}
