import { Button } from '@kstackz/expo-platform/components/button';
import { Choice } from '@kstackz/expo-platform/components/choice';
import { Input } from '@kstackz/expo-platform/components/input';
import { Sheet } from '@kstackz/expo-platform/recipes/sheet';
import { keys, useCommand } from '@ledger/core/app/commands';
import { useMoney, useWrites } from '@ledger/core/app/session';
import { ACCOUNT_KINDS } from '@ledger/core/app/places';
import type { Account } from '@ledger/core/model';
import { useState } from 'react';
import { View } from 'react-native';
import { useGate } from '../../../ledger';
import { AccountIcon } from '../../parts';

// The Account the sheet opens for; none for a new one.
let asked: string | undefined;

/** Opens the Accounts sheet: for a new Account, or to rename `id`. */
export const useOpenAccount = () => {
  const { openSurface } = keys.useSurface();
  return (id?: string) => {
    asked = id;
    openSurface('account');
  };
};

/**
 * The Accounts sheet, whole: open while its Surface is, to add an Account
 * or rename one. Dragged down, it closes back where it opened.
 */
export function AccountSheet() {
  const { surface, closeSurface } = keys.useSurface();
  const open = surface === 'account';
  // A fresh form each opening.
  const [form, setForm] = useState({ opened: 0, id: asked });
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setForm((now) => ({ opened: now.opened + 1, id: asked }));
  }
  const close = () => closeSurface('account');
  useCommand('account.cancel', close);
  const renaming = form.id !== undefined;
  return (
    <Sheet
      open={open}
      onClose={close}
      title={renaming ? 'Rename account' : 'New account'}
    >
      <Form key={form.opened} id={form.id} onDone={close} />
    </Sheet>
  );
}

function Form(props: {
  readonly id: string | undefined;
  readonly onDone: () => void;
}) {
  const money = useMoney();
  const { online } = useGate();
  const { addAccount, renameAccount } = useWrites();
  const account = money.accounts.find((each) => each.id === props.id);
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<Account['kind']>(account?.kind ?? 'bank');
  const ready = name.trim() !== '' && online;
  const submit = () => {
    if (!ready) return;
    if (account) renameAccount(account.id, name.trim());
    else addAccount({ name: name.trim(), kind });
    props.onDone();
  };

  return (
    <View className="gap-5 pb-2">
      <Input
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder="Name, like Everyday card"
        accessibilityLabel="Name"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {account === undefined && (
        <Choice
          label="Kind"
          value={kind}
          onChange={setKind}
          options={ACCOUNT_KINDS.map((each) => ({
            ...each,
            icon: <AccountIcon kind={each.value} size={14} />,
          }))}
        />
      )}
      <View className="flex-row justify-end gap-2">
        <Button variant="ghost" onPress={props.onDone}>
          Cancel
        </Button>
        <Button disabled={!ready} onPress={submit}>
          {account ? 'Rename' : 'Add account'}
        </Button>
      </View>
    </View>
  );
}
