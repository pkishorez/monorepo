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

export const MAX_OPENING_BALANCE = 10_000;
const DEFAULT_OPENING_BALANCE = '500';

export interface OpenAccountDraft {
  readonly name: string;
  readonly balance: number;
}

export function OpenAccountDialog({
  open,
  onOpenChange,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: (draft: OpenAccountDraft) => void;
}) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState(DEFAULT_OPENING_BALANCE);

  const value = balance.trim() === '' ? 0 : Number(balance);
  const balanceOk =
    Number.isInteger(value) && value >= 0 && value <= MAX_OPENING_BALANCE;
  const ready = name.trim().length > 0 && balanceOk;

  const reset = () => {
    setName('');
    setBalance(DEFAULT_OPENING_BALANCE);
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
            Give it a name and an opening balance. You will be banking as this
            account right away.
          </DialogDescription>
        </DialogHeader>
        <form
          id="open-account"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            onOpen({ name, balance: value });
            reset();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Priya Raman"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-balance">Opening balance</Label>
            <Input
              id="account-balance"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_OPENING_BALANCE}
              step={1}
              value={balance}
              onChange={(event) => setBalance(event.target.value)}
              placeholder="0"
              className="font-mono tabular-nums"
            />
            <p className="h-4 text-xs text-muted-foreground">
              {balanceOk
                ? `Up to ${MAX_OPENING_BALANCE.toLocaleString()}`
                : `Enter a whole number between 0 and ${MAX_OPENING_BALANCE.toLocaleString()}`}
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="open-account"
            size="lg"
            disabled={!ready}
            className="w-full"
          >
            Open account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
