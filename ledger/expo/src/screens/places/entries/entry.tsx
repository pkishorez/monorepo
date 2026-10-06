import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import ArrowLeft02Icon from '@hugeicons/core-free-icons/ArrowLeft02Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import { Button } from '@kstackz/expo-toolkit/components/button';
import { Choice } from '@kstackz/expo-toolkit/components/choice';
import { Glyph } from '@kstackz/expo-toolkit/components/glyph';
import { Input } from '@kstackz/expo-toolkit/components/input';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { keys, useCommand, usePlace } from '@ledger/core/client/commands';
import { useMoney, useWrites } from '@ledger/core/client/session';
import {
  type EntriesSearch,
  entryAt,
  narrowing,
} from '@ledger/core/client/views';
import {
  centsOf,
  dayName,
  type Entry as EntryRow,
} from '@ledger/core/shared/ledger';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  AccountIcon,
  Amount,
  CategoryIcon,
  DayStepper,
  Scroll,
  useToneOf,
} from '../../parts';
import { useRemoveEntry } from './remove';

/**
 * An Entry, a Place just under Entries: every part of it changes where it
 * stands, and saves as it changes. Next and Previous open the Entries
 * beside it in the list; Jump goes back to the list with it marked.
 */
export function Entry(props: {
  readonly entryId: string;
  readonly search: EntriesSearch;
}) {
  usePlace('entries.entry');
  const money = useMoney();
  const router = useRouter();
  const forget = useRemoveEntry();
  const { surface } = keys.useSurface();
  const { entry, position, next, previous } = entryAt(
    money.entries,
    props.search,
    props.entryId,
  );
  const active = surface === 'entries.entry';
  const kept = narrowing(props.search);

  const go = (id: string) =>
    router.replace({
      pathname: '/entries/[entryId]',
      params: { entryId: id, ...kept },
    });
  const back = () =>
    router.navigate({
      pathname: '/entries',
      params: { ...kept, at: props.entryId },
    });
  useCommand('next', () => next && go(next.id), {
    enabled: active && next !== undefined,
  });
  useCommand('previous', () => previous && go(previous.id), {
    enabled: active && previous !== undefined,
  });
  useCommand('jump', back, { enabled: active });
  useCommand('entries.entry.back', back, { enabled: active });
  const remove = () => {
    if (entry === undefined) return;
    const after = next ?? previous;
    forget(entry);
    if (after) go(after.id);
    else router.navigate({ pathname: '/entries', params: kept });
  };
  useCommand('entries.entry.remove', remove, {
    enabled: active && entry !== undefined,
  });

  if (entry === undefined) {
    return (
      <View className="flex-1 items-center justify-center p-10">
        {money.ready && (
          <Text muted className="text-sm">
            This entry is gone.
          </Text>
        )}
      </View>
    );
  }
  return (
    <Editor
      key={entry.id}
      entry={entry}
      active={active}
      position={position}
      onBack={back}
      onNext={next && (() => go(next.id))}
      onPrevious={previous && (() => go(previous.id))}
      onRemove={remove}
    />
  );
}

function Editor(props: {
  readonly entry: EntryRow;
  readonly active: boolean;
  readonly position: string | undefined;
  readonly onBack: () => void;
  readonly onNext: (() => void) | undefined;
  readonly onPrevious: (() => void) | undefined;
  readonly onRemove: () => void;
}) {
  const { entry } = props;
  const money = useMoney();
  const { updateEntry } = useWrites();
  const currency = money.currency;
  const toneOf = useToneOf();
  const [memo, setMemo] = useState(entry.memo);
  const [typed, setTyped] = useState((entry.cents / 100).toFixed(2));
  const memoField = useRef<TextInput>(null);
  const foreground = useCSSVariable('--color-foreground');
  const category = money.categories.find(
    (each) => each.id === entry.categoryId,
  );
  const save = (changes: Partial<EntryRow>) => updateEntry(entry.id, changes);

  // Another device changed it: show theirs unless the memo is being typed in.
  useEffect(() => {
    if (!memoField.current?.isFocused()) setMemo(entry.memo);
  }, [entry.memo]);

  useCommand('entries.entry.edit', () => memoField.current?.focus(), {
    enabled: props.active,
  });
  useCommand(
    'entries.entry.way',
    () => save({ way: entry.way === 'in' ? 'out' : 'in' }),
    { enabled: props.active },
  );

  const saveAmount = () => {
    const cents = centsOf(typed);
    if (cents > 0 && cents !== entry.cents) save({ cents });
    else setTyped((entry.cents / 100).toFixed(2));
  };

  return (
    <Scroll className="gap-6 pt-3">
      <View className="-mx-2 flex-row items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Back to the list"
          onPress={props.onBack}
        >
          <Glyph icon={ArrowLeft02Icon} tone="foreground" />
        </Button>
        <Text muted className="flex-1 text-sm">
          {props.position}
        </Text>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Previous entry"
          disabled={!props.onPrevious}
          onPress={props.onPrevious}
        >
          <Glyph icon={ArrowLeft01Icon} color={toneOf(!!props.onPrevious)} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Next entry"
          disabled={!props.onNext}
          onPress={props.onNext}
        >
          <Glyph icon={ArrowRight01Icon} color={toneOf(!!props.onNext)} />
        </Button>
      </View>

      <View className="items-center gap-3">
        <View className="size-11 items-center justify-center rounded-full border border-border">
          <CategoryIcon icon={category?.icon} size={20} />
        </View>
        <TextInput
          accessibilityLabel="Amount"
          keyboardType="decimal-pad"
          value={typed}
          onChangeText={(text) => setTyped(text.replace(',', '.'))}
          onBlur={saveAmount}
          onSubmitEditing={saveAmount}
          selectTextOnFocus
          className="w-full text-center font-semibold text-4xl text-foreground"
          style={{
            fontVariant: ['tabular-nums'],
            color: typeof foreground === 'string' ? foreground : undefined,
          }}
        />
        <Text muted className="text-sm">
          {entry.way === 'in' ? 'Money in' : 'Money out'} · {dayName(entry.day)}{' '}
          ·{' '}
          <Amount
            cents={entry.cents}
            way={entry.way}
            currency={currency}
            className="text-sm text-muted-foreground"
          />
        </Text>
      </View>

      <Field label="Memo">
        <Input
          ref={memoField}
          value={memo}
          multiline
          placeholder="What was it?"
          accessibilityLabel="Memo"
          onChangeText={setMemo}
          onBlur={() =>
            memo.trim() !== entry.memo && save({ memo: memo.trim() })
          }
        />
      </Field>
      <Field label="Money">
        <Choice
          label="Money in or out"
          value={entry.way}
          onChange={(way) => save({ way })}
          options={[
            { value: 'out', label: 'Out' },
            { value: 'in', label: 'In' },
          ]}
        />
      </Field>
      <Field label="Category">
        <Choice
          bleed={16}
          label="Category"
          value={entry.categoryId}
          onChange={(categoryId) => save({ categoryId })}
          options={money.categories.map((each) => ({
            value: each.id,
            label: each.name,
            icon: <CategoryIcon icon={each.icon} size={14} />,
          }))}
        />
      </Field>
      <Field label="Account">
        <Choice
          bleed={16}
          label="Account"
          value={entry.accountId}
          onChange={(accountId) => save({ accountId })}
          options={money.accounts.map((account) => ({
            value: account.id,
            label: account.name,
            icon: <AccountIcon kind={account.kind} size={14} />,
          }))}
        />
      </Field>
      <Field label="Day">
        <View className="flex-row">
          <DayStepper value={entry.day} onChange={(day) => save({ day })} />
        </View>
      </Field>
      <View className="flex-row">
        <Button
          variant="ghost"
          accessibilityLabel="Delete the entry"
          labelClassName="text-destructive"
          startContent={
            <Glyph icon={Delete02Icon} size={16} tone="destructive" />
          }
          onPress={props.onRemove}
        >
          Delete
        </Button>
      </View>
    </Scroll>
  );
}

function Field(props: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text muted className="text-xs">
        {props.label}
      </Text>
      {props.children}
    </View>
  );
}
