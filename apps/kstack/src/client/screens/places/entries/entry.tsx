import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { toast } from '@kstackz/ui-toolkit/components/ui/sonner';
import { Textarea } from '@kstackz/ui-toolkit/components/ui/textarea';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from '@kstackz/ui-toolkit/lucide';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { BindingKeys, keys, useCommand } from '../../../commands/index.ts';
import { useMoney, useWrites } from '../../../state/session/index.ts';
import {
  centsOf,
  dayName,
  type Entry,
  today,
} from '../../../../shared/ledger/index.ts';
import {
  AccountIcon,
  Amount,
  CategoryIcon,
  Choice,
} from '../../parts/index.ts';
import { type EntriesSearch, narrowing, shownBy } from './filter.ts';

/**
 * One Entry, open: every part of it changes where it stands, and saves as
 * it changes. Next and Previous open the Entries beside it in the list;
 * Jump goes back to the list with it marked.
 */
export function EntryPane(props: {
  readonly id: string;
  readonly search: EntriesSearch;
  readonly wide: boolean;
}) {
  const money = useMoney();
  const navigate = useNavigate();
  const { surface, setSurface } = keys.useSurface();
  const { removeEntry, restoreEntry } = useWrites();
  const shown = shownBy(money.entries, props.search);
  const at = shown.findIndex((entry) => entry.id === props.id);
  const entry = shown[at] ?? money.entries.find((each) => each.id === props.id);
  const active = surface === 'entries.entry';

  const go = (id: string) =>
    void navigate({
      to: '/entries/$entryId',
      params: { entryId: id },
      search: narrowing(props.search),
      replace: true,
    });
  const back = () => {
    if (props.wide) setSurface('entries');
    else
      void navigate({
        to: '/entries',
        search: { ...narrowing(props.search), at: props.id },
      });
  };

  const next = shown[at + 1];
  const previous = shown[at - 1];
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
    removeEntry(entry.id);
    toast(`Deleted ${entry.memo || 'the entry'}`, {
      action: { label: 'Undo', onClick: () => restoreEntry(entry) },
    });
    if (after) go(after.id);
    else void navigate({ to: '/entries', search: narrowing(props.search) });
  };
  useCommand('entries.entry.remove', remove, {
    enabled: active && entry !== undefined,
  });

  if (entry === undefined) {
    return (
      <div className="grid h-full place-items-center p-10 text-sm text-muted-foreground">
        {money.ready ? 'This entry is gone.' : null}
      </div>
    );
  }
  return (
    <Editor
      key={entry.id}
      entry={entry}
      active={active}
      position={at >= 0 ? `${at + 1} of ${shown.length}` : undefined}
      onBack={back}
      onNext={next && (() => go(next.id))}
      onPrevious={previous && (() => go(previous.id))}
      onRemove={remove}
      showBack={!props.wide}
    />
  );
}

function Editor(props: {
  readonly entry: Entry;
  readonly active: boolean;
  readonly position: string | undefined;
  readonly onBack: () => void;
  readonly onNext: (() => void) | undefined;
  readonly onPrevious: (() => void) | undefined;
  readonly onRemove: () => void;
  readonly showBack: boolean;
}) {
  const { entry } = props;
  const money = useMoney();
  const { updateEntry } = useWrites();
  const { actions } = keys.useStatus();
  const currency = money.currency;
  const [memo, setMemo] = useState(entry.memo);
  const [typed, setTyped] = useState((entry.cents / 100).toFixed(2));
  const memoField = useRef<HTMLTextAreaElement>(null);
  const category = money.categories.find(
    (each) => each.id === entry.categoryId,
  );
  const save = (changes: Partial<Entry>) => updateEntry(entry.id, changes);

  // Another device changed it: show theirs unless this field is being typed in.
  useEffect(() => {
    if (document.activeElement !== memoField.current) setMemo(entry.memo);
  }, [entry.memo]);

  // Typing goes on at the end of the memo.
  const edit = () => {
    const field = memoField.current;
    if (field === null) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };
  useCommand('entries.entry.edit', edit, {
    enabled: props.active,
  });
  useCommand(
    'entries.entry.way',
    () => save({ way: entry.way === 'in' ? 'out' : 'in' }),
    { enabled: props.active },
  );
  const keyOf = (id: string) =>
    actions.find((action) => action.id === id)?.bindings[0]?.binding;

  const saveAmount = () => {
    const cents = centsOf(typed);
    if (cents > 0 && cents !== entry.cents) save({ cents });
    else setTyped((entry.cents / 100).toFixed(2));
  };

  return (
    <article className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-5 pb-28 @md:px-8 @md:py-8">
      <div className="flex items-center gap-2">
        {props.showBack && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            aria-label="Back to the list"
            onClick={props.onBack}
          >
            <ArrowLeft />
          </Button>
        )}
        <span className="flex-1 text-sm text-muted-foreground">
          {props.position}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous entry"
          disabled={!props.onPrevious}
          onClick={props.onPrevious}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next entry"
          disabled={!props.onNext}
          onClick={props.onNext}
        >
          <ChevronRight />
        </Button>
      </div>

      <header className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-full border">
          <CategoryIcon icon={category?.icon} className="size-5" />
        </span>
        <label className="w-full">
          <span className="sr-only">Amount</span>
          <input
            inputMode="decimal"
            value={typed}
            onChange={(event) => setTyped(event.target.value.replace(',', '.'))}
            onBlur={saveAmount}
            onKeyDown={(event) =>
              event.key === 'Enter' && event.currentTarget.blur()
            }
            className="w-full rounded-md bg-transparent text-center text-4xl font-semibold tracking-tight tabular-nums outline-none focus-visible:bg-accent/60"
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {entry.way === 'in' ? 'Money in' : 'Money out'} · {dayName(entry.day)}{' '}
          · <Amount cents={entry.cents} way={entry.way} currency={currency} />
        </p>
      </header>

      <Field label="Memo" hint={keyOf('entries.entry.edit')}>
        <Textarea
          ref={memoField}
          value={memo}
          rows={2}
          placeholder="What was it?"
          onChange={(event) => setMemo(event.target.value)}
          onBlur={() =>
            memo.trim() !== entry.memo && save({ memo: memo.trim() })
          }
          className="resize-none text-base"
        />
      </Field>
      <Field label="Money" hint={keyOf('entries.entry.way')}>
        <Choice
          label="Money in or out"
          value={entry.way}
          onChange={(way) => save({ way })}
          className="mx-0 px-0"
          options={[
            { value: 'out', label: 'Out' },
            { value: 'in', label: 'In' },
          ]}
        />
      </Field>
      <Field label="Category">
        <Choice
          label="Category"
          value={entry.categoryId}
          onChange={(categoryId) => save({ categoryId })}
          options={money.categories.map((each) => ({
            value: each.id,
            label: each.name,
            icon: <CategoryIcon icon={each.icon} className="text-current" />,
          }))}
        />
      </Field>
      <Field label="Account">
        <Choice
          label="Account"
          value={entry.accountId}
          onChange={(accountId) => save({ accountId })}
          options={money.accounts.map((account) => ({
            value: account.id,
            label: account.name,
            icon: <AccountIcon kind={account.kind} />,
          }))}
        />
      </Field>
      <Field label="Day">
        <input
          type="date"
          value={entry.day}
          max={today()}
          onChange={(event) =>
            event.target.value && save({ day: event.target.value })
          }
          className="h-9 rounded-md border bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
      </Field>
      <Button
        variant="ghost"
        className="self-start gap-2 text-destructive hover:text-destructive"
        onClick={props.onRemove}
      >
        <Trash2 className="size-4" aria-hidden="true" /> Delete
        {keyOf('entries.entry.remove') && (
          <BindingKeys
            binding={keyOf('entries.entry.remove')!}
            className="opacity-70"
          />
        )}
      </Button>
    </article>
  );
}

function Field(props: {
  readonly label: string;
  readonly hint?: Parameters<typeof BindingKeys>[0]['binding'] | undefined;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{props.label}</span>
        {props.hint && (
          <BindingKeys binding={props.hint} className="opacity-60" />
        )}
      </div>
      {props.children}
    </div>
  );
}
