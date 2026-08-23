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
import { DEFAULT_SEED_COUNT, digitsOnly, MAX_SEED_COUNT } from '../shared.ts';

export function SeedDialog({
  open,
  onOpenChange,
  onSeed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeed: (count: number) => void;
}) {
  const [count, setCount] = useState(String(DEFAULT_SEED_COUNT));

  const value = Number(count);
  const ready = Number.isInteger(value) && value > 0 && value <= MAX_SEED_COUNT;

  const reset = () => setCount(String(DEFAULT_SEED_COUNT));

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
          <DialogTitle className="text-base">Seed accounts</DialogTitle>
          <DialogDescription className="text-xs">
            Open this many accounts with random names and balances, up to{' '}
            {MAX_SEED_COUNT.toLocaleString()}.
          </DialogDescription>
        </DialogHeader>
        <form
          id="seed-accounts"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            onSeed(value);
            reset();
            onOpenChange(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="seed-count">How many</Label>
            <Input
              id="seed-count"
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SEED_COUNT}
              step={1}
              value={count}
              onChange={(event) => setCount(digitsOnly(event.target.value))}
              className="font-mono tabular-nums"
            />
          </div>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="seed-accounts"
            disabled={!ready}
            className="w-full"
          >
            Seed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
