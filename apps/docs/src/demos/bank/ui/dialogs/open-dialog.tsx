import { useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import { Input } from '@monorepo/frontend/components/ui/input';
import { Label } from '@monorepo/frontend/components/ui/label';
import { formatMoney } from '../ledger/money.ts';
import {
  DEFAULT_OPENING_BALANCE,
  digitsOnly,
  MAX_OPENING_BALANCE,
  type Opening,
} from '../shared.ts';

export function OpenDialog({
  open,
  onOpenChange,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: (opening: Opening) => void;
}) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState(String(DEFAULT_OPENING_BALANCE));

  const value = Number(balance);
  const ready =
    name.trim().length > 0 &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_OPENING_BALANCE;

  const reset = () => {
    setName('');
    setBalance(String(DEFAULT_OPENING_BALANCE));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="top-24 max-w-sm -translate-y-0 gap-6 p-6">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-base">Open an account</DialogTitle>
          <DialogDescription className="text-xs">
            A name and an opening balance, up to{' '}
            {formatMoney(MAX_OPENING_BALANCE)}.
          </DialogDescription>
        </DialogHeader>
        <form
          id="open-account"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            onOpen({ name: name.trim().replace(/\s+/g, ' '), balance: value });
            reset();
            onOpenChange(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="open-name">Name</Label>
            <Input
              id="open-name"
              autoFocus
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="open-balance">Opening balance</Label>
            <Input
              id="open-balance"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_OPENING_BALANCE}
              step={1}
              value={balance}
              onChange={(event) => setBalance(digitsOnly(event.target.value))}
              className="font-mono tabular-nums"
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="open-account"
            disabled={!ready}
            className="w-full"
          >
            Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
