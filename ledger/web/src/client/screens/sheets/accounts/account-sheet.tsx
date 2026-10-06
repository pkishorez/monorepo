import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kstackz/ui-toolkit/components/ui/dialog';
import { Input } from '@kstackz/ui-toolkit/components/ui/input';
import { useState } from 'react';
import { keys, useCommand } from '@ledger/core/client/commands';
import { useMoney, useWrites } from '@ledger/core/client/session';
import { useOnline } from '../../../app/index.ts';
import { ACCOUNT_KINDS } from '@ledger/core/client/views';
import type { Account } from '@ledger/core/shared/ledger';
import { AccountIcon, Choice } from '../../parts/index.ts';

// The Account the sheet opens for; none for a new one.
let asked: string | undefined;

/** Opens the Account sheet: for a new Account, or to rename `id`. */
export const useOpenAccount = () => {
  const { openSurface } = keys.useSurface();
  return (id?: string) => {
    asked = id;
    openSurface('account');
  };
};

/**
 * The Account sheet, whole: a dialog while its Surface is Active, to add
 * an Account or rename one. Escape closes it back where it opened.
 */
export function AccountSheet() {
  const { surface, closeSurface } = keys.useSurface();
  const open = surface === 'account';
  // A fresh form each opening, kept while the dialog animates out.
  const [form, setForm] = useState({ opened: 0, id: asked });
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setForm((now) => ({ opened: now.opened + 1, id: asked }));
  }
  const close = () => closeSurface('account');
  useCommand('account.cancel', close);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-sm">
        <Form key={form.opened} id={form.id} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}

function Form(props: {
  readonly id: string | undefined;
  readonly onDone: () => void;
}) {
  const money = useMoney();
  const online = useOnline();
  const { addAccount, renameAccount } = useWrites();
  const account = money.accounts.find((each) => each.id === props.id);
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<Account['kind']>(account?.kind ?? 'bank');
  const ready = name.trim() !== '' && online;

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        if (account) renameAccount(account.id, name.trim());
        else addAccount({ name: name.trim(), kind });
        props.onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>{account ? 'Rename account' : 'New account'}</DialogTitle>
      </DialogHeader>
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name, like Everyday card"
        aria-label="Name"
        className="h-10 text-base"
      />
      {account === undefined && (
        <Choice
          label="Kind"
          value={kind}
          onChange={setKind}
          className="mx-0 px-0"
          options={ACCOUNT_KINDS.map((each) => ({
            ...each,
            icon: <AccountIcon kind={each.value} />,
          }))}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={props.onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          {account ? 'Rename' : 'Add account'}
        </Button>
      </DialogFooter>
    </form>
  );
}
