import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@kstackz/ui-toolkit/components/ui/drawer';
import { Input } from '@kstackz/ui-toolkit/components/ui/input';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useState } from 'react';
import {
  BindingKeys,
  keys,
  useCommand,
  useDevice,
} from '../../../commands/index.ts';
import { useMoney, useWrites } from '../../../state/session/index.ts';
import {
  centsOf,
  dayOf,
  money as format,
  today,
  type Way,
} from '../../../../domain/ledger/index.ts';
import { AccountIcon, CategoryIcon, Choice } from '../../parts/index.ts';
import { AmountPad } from './amount-pad.tsx';

/**
 * Add, whole: a sheet from the bottom while its Surface is Open, dragged
 * down or Escape to close it back where it opened. Each opening starts a
 * fresh Entry.
 */
export function AddSheet() {
  const { surface, closeSurface } = keys.useSurface();
  const open = surface === 'add';
  // A new key each opening: a fresh form, while the last one animates out.
  const [opened, setOpened] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setOpened((n) => n + 1);
  }
  useCommand('add.cancel', () => closeSurface('add'));
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSurface('add');
      }}
    >
      <DrawerContent className="sm:mx-auto sm:mb-6 sm:w-full sm:max-w-lg sm:rounded-xl sm:border sm:after:hidden">
        <DrawerTitle className="sr-only">Add an entry</DrawerTitle>
        <Form key={opened} open={open} onDone={() => closeSurface('add')} />
      </DrawerContent>
    </Drawer>
  );
}

function Form(props: { readonly open: boolean; readonly onDone: () => void }) {
  const money = useMoney();
  const { addEntry } = useWrites();
  const { actions } = keys.useStatus();
  const currency = money.currency;
  const [way, setWay] = useState<Way>('out');
  const [typed, setTyped] = useState('');
  const [memo, setMemo] = useState('');
  const [day, setDay] = useState(today());
  const fits = money.categories.filter((category) => category.way === way);
  const [categoryId, setCategoryId] = useState<string>();
  const [accountId, setAccountId] = useState<string>(
    () =>
      money.accounts.find((account) => account.kind === 'card')?.id ??
      money.accounts[0]?.id ??
      '',
  );
  const category = fits.find((each) => each.id === categoryId) ?? fits[0];
  const cents = centsOf(typed);
  // A touch screen with no keyboard gets the Amount Pad, so opening Add
  // does not open the phone's keyboard; any keyboard types the amount.
  const device = useDevice();
  const pad = device.touch && !device.keyboard;
  const ready = cents > 0 && category !== undefined && accountId !== '';

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
  const keyOf = (id: string) =>
    actions.find((action) => action.id === id)?.bindings[0]?.binding;
  const saveKey = keyOf('add.save');
  const wayKey = keyOf('add.way');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const days = [
    { value: today(), label: 'Today' },
    { value: dayOf(yesterday), label: 'Yesterday' },
  ];

  return (
    <form
      className="flex flex-col gap-5 overflow-y-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
      <div className="flex items-center justify-between gap-3">
        <Choice<Way>
          label="Money in or out"
          value={way}
          onChange={setWay}
          className="mx-0 px-0"
          options={[
            { value: 'out', label: 'Money out' },
            { value: 'in', label: 'Money in' },
          ]}
        />
        {wayKey && <BindingKeys binding={wayKey} className="opacity-60" />}
      </div>

      <label className="flex flex-col items-center gap-1 py-2">
        <span className="sr-only">Amount</span>
        {pad ? (
          <output
            aria-live="polite"
            className={cn(
              'text-5xl font-semibold tracking-tight tabular-nums',
              typed === '' && 'text-muted-foreground/40',
            )}
          >
            {typed || '0.00'}
          </output>
        ) : (
          <input
            autoFocus
            inputMode="decimal"
            value={typed}
            placeholder="0.00"
            onChange={(event) => setTyped(event.target.value.replace(',', '.'))}
            className="w-full bg-transparent text-center text-5xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40"
          />
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          {cents > 0
            ? `${way === 'in' ? '+' : '−'}${format(cents, currency)}`
            : currency}
        </span>
      </label>

      <Choice
        label="Category"
        value={category?.id ?? ''}
        onChange={setCategoryId}
        options={fits.map((each) => ({
          value: each.id,
          label: each.name,
          icon: <CategoryIcon icon={each.icon} className="text-current" />,
        }))}
      />
      <Choice
        label="Account"
        value={accountId}
        onChange={setAccountId}
        options={money.accounts.map((account) => ({
          value: account.id,
          label: account.name,
          icon: <AccountIcon kind={account.kind} />,
        }))}
      />
      <Input
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="What was it?"
        className="h-11"
      />
      <div className="flex items-center gap-2">
        <Choice
          label="Day"
          value={day}
          onChange={setDay}
          options={days}
          className="mx-0 px-0"
        />
        <Input
          type="date"
          value={day}
          max={today()}
          onChange={(event) => event.target.value && setDay(event.target.value)}
          className="h-9 w-auto"
          aria-label="Another day"
        />
      </div>
      {pad && <AmountPad value={typed} onChange={setTyped} />}
      <Button type="submit" size="lg" className="h-11 gap-2" disabled={!ready}>
        Save
        {saveKey && (
          <BindingKeys
            binding={saveKey}
            className="[&_kbd]:bg-primary-foreground/20 [&_kbd]:text-primary-foreground"
          />
        )}
      </Button>
    </form>
  );
}
