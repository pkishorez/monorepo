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
import type { Account } from '../../contract/account/index.ts';
import { formatMoney, Monogram } from '../money/index.ts';

export function SendDialog({
  peer,
  available,
  onSend,
  onDismiss,
}: {
  peer: Account | null;
  available: number;
  onSend: (amount: number) => void;
  onDismiss: () => void;
}) {
  const [amount, setAmount] = useState('');
  const value = amount.trim() === '' ? 0 : Number(amount);
  const withinBounds = value >= 0 && value <= available;
  const ready = Number.isInteger(value) && value > 0 && withinBounds;

  return (
    <Dialog
      open={peer !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAmount('');
          onDismiss();
        }
      }}
    >
      <DialogContent className="top-24 max-w-sm -translate-y-0 gap-6 p-6">
        {peer !== null && (
          <>
            <DialogHeader className="gap-0">
              <div className="flex items-center gap-3">
                <Monogram name={peer.name} className="size-10" />
                <div className="min-w-0 text-left">
                  <DialogTitle className="truncate text-base">
                    Send to {peer.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {formatMoney(available)} available
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <form
              id="send-money"
              onSubmit={(event) => {
                event.preventDefault();
                if (!ready) return;
                setAmount('');
                onSend(value);
              }}
            >
              <Input
                autoFocus
                type="number"
                inputMode="numeric"
                min={0}
                max={available}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
                className="h-20 border-0 bg-transparent text-center font-mono !text-6xl font-semibold tracking-tight tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <p className="mt-2 h-4 text-center text-xs text-muted-foreground">
                {withinBounds
                  ? `Up to ${formatMoney(available)}`
                  : `More than ${formatMoney(available)} available`}
              </p>
            </form>
            <DialogFooter>
              <Button
                type="submit"
                form="send-money"
                size="lg"
                disabled={!ready}
                className="w-full"
              >
                Send {ready ? formatMoney(value) : ''}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
