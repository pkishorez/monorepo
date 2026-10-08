import { Button } from '@kstackz/expo-platform/components/button';
import { Choice } from '@kstackz/expo-platform/components/choice';
import { Input } from '@kstackz/expo-platform/components/input';
import { Text } from '@kstackz/expo-platform/components/text';
import { Sheet } from '@kstackz/expo-platform/recipes/sheet';
import { keys, useCommand } from '@ledger/core/commands';
import { useMutations } from '@ledger/core/mutations';
import { useAccounts, useCategories, useCurrency } from '@ledger/core/queries';
import { firstAccount, quickDays } from '@ledger/core/places';
import { centsOf, money as format, today, type Way } from '@ledger/core/model';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { AccountIcon, CategoryIcon, DayStepper } from '../../parts';

/**
 * Add, whole: a sheet from the bottom while its Surface is Open, dragged
 * down to close back where it opened. Each opening starts a fresh Entry,
 * with the amount ready to type.
 */
export function AddSheet() {
  const { surface, closeSurface } = keys.useSurface();
  const open = surface === 'add';
  // A new key each opening: a fresh form.
  const [opened, setOpened] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setOpened((n) => n + 1);
  }
  const close = () => closeSurface('add');
  useCommand('add.cancel', close);
  return (
    <Sheet open={open} onClose={close} title="Add an entry" titleHidden>
      <Form key={opened} open={open} onDone={close} />
    </Sheet>
  );
}

function Form(props: { readonly open: boolean; readonly onDone: () => void }) {
  const { accounts } = useAccounts();
  const { addEntry } = useMutations();
  const currency = useCurrency();
  const [way, setWay] = useState<Way>('out');
  const [typed, setTyped] = useState('');
  const [memo, setMemo] = useState('');
  const [day, setDay] = useState(today());
  const { categories: fits } = useCategories(way);
  const [categoryId, setCategoryId] = useState<string>();
  const [accountId, setAccountId] = useState(() => firstAccount(accounts));
  const category = fits.find((each) => each.id === categoryId) ?? fits[0];
  const cents = centsOf(typed);
  const ready = cents > 0 && category !== undefined && accountId !== '';
  const foreground = useCSSVariable('--color-foreground');
  const muted = useCSSVariable('--color-muted-foreground');

  const save = () => {
    if (!ready) return;
    addEntry({
      accountId,
      categoryId: category.id,
      cents,
      way,
      memo: memo.trim(),
      day,
    });
    props.onDone();
  };
  useCommand('add.save', save, { enabled: props.open && ready });
  useCommand('add.way', () => setWay((now) => (now === 'in' ? 'out' : 'in')), {
    enabled: props.open,
  });
  const days = quickDays();

  return (
    <View className="gap-5 pt-1 pb-2">
      <Choice<Way>
        label="Money in or out"
        value={way}
        onChange={setWay}
        options={[
          { value: 'out', label: 'Money out' },
          { value: 'in', label: 'Money in' },
        ]}
      />

      <View className="items-center gap-1 py-2">
        <TextInput
          autoFocus
          accessibilityLabel="Amount"
          keyboardType="decimal-pad"
          value={typed}
          placeholder="0.00"
          placeholderTextColor={typeof muted === 'string' ? muted : undefined}
          onChangeText={(text) => setTyped(text.replace(',', '.'))}
          className="w-full text-center font-semibold text-5xl"
          style={{
            fontVariant: ['tabular-nums'],
            color: typeof foreground === 'string' ? foreground : undefined,
          }}
        />
        <Text
          muted
          className="text-sm"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {cents > 0
            ? `${way === 'in' ? '+' : '−'}${format(cents, currency)}`
            : currency}
        </Text>
      </View>

      <Choice
        bleed={20}
        label="Category"
        value={category?.id ?? ''}
        onChange={setCategoryId}
        options={fits.map((each) => ({
          value: each.id,
          label: each.name,
          icon: <CategoryIcon icon={each.icon} size={14} />,
        }))}
      />
      <Choice
        bleed={20}
        label="Account"
        value={accountId}
        onChange={setAccountId}
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name,
          icon: <AccountIcon kind={account.kind} size={14} />,
        }))}
      />
      <Input
        value={memo}
        onChangeText={setMemo}
        placeholder="What was it?"
        accessibilityLabel="Memo"
        returnKeyType="done"
      />
      <View className="flex-row flex-wrap items-center gap-2">
        <Choice label="Day" value={day} onChange={setDay} options={days} />
        <DayStepper value={day} onChange={setDay} />
      </View>
      <Button size="lg" disabled={!ready} onPress={save}>
        Save
      </Button>
    </View>
  );
}
