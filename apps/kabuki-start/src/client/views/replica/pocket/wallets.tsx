import { useContext } from 'react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { nextWalletName, Pages } from '../../../../shared/pages/index.ts';
import { LedgerContext, money } from './ledger.ts';
import { Refusal } from './refusal.tsx';

/*
 * The wallets, oldest first, each with its balance, a switch that syncs
 * its entries, and, while the Pocket writes, four buttons: in $10, out $5,
 * $5 to the next wallet, and $1 in from elsewhere, which only a wallet
 * whose entries sync brings into the activity. Then the button that adds
 * `Wallet n`.
 */

const small =
  'touch-manipulation tabular-nums pointer-coarse:h-11 pointer-coarse:px-3';

export const WalletsView = View.make(Pages.Wallets, ({ root, model }) => {
  const { writes, refusedAt, watching, watch } = useContext(LedgerContext);
  if (model.status === 'failed')
    return (
      <p {...root} role="alert" className="text-sm text-destructive">
        {model.problem}
      </p>
    );
  if (model.status === 'loading')
    return (
      <p
        {...root}
        aria-busy
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <Spinner /> Opening from this device…
      </p>
    );
  const wallets = model.rows
    .map(({ row }) => row)
    .sort((a, b) => a.id.localeCompare(b.id));
  const add = writes && (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={wallets.length === 0 ? 'default' : 'outline'}
        size="sm"
        className={small}
        onClick={() =>
          writes.addWallet(nextWalletName(wallets.map(({ name }) => name)))
        }
      >
        <PlusIcon /> Wallet
      </Button>
      <Refusal reason={refusedAt('new')} />
    </div>
  );
  if (wallets.length === 0)
    return (
      <div {...root} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {writes
            ? 'No wallets yet — add one.'
            : 'Nothing kept on this device for this account yet. Make it active once and it syncs here.'}
        </p>
        {add}
      </div>
    );
  return (
    <div {...root} className="space-y-3">
      <ul className="space-y-2">
        {wallets.map(({ id, name, balance }, at) => {
          const to =
            wallets.length > 1 ? wallets[(at + 1) % wallets.length] : undefined;
          return (
            <li
              key={id}
              className="space-y-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted-foreground">
                    {name}
                  </p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {money(balance)}
                  </p>
                </div>
                <label className="flex min-h-8 cursor-pointer touch-manipulation items-center gap-2 self-start text-sm text-muted-foreground select-none pointer-coarse:min-h-11">
                  <Switch
                    size="sm"
                    checked={watching.includes(id)}
                    onCheckedChange={() => watch(id)}
                  />
                  Sync entries<span className="sr-only"> of {name}</span>
                </label>
              </div>
              {writes && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={small}
                    aria-label={`Add $10 to ${name}`}
                    onClick={() => writes.change(id, 1000)}
                  >
                    +$10
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={small}
                    aria-label={`Take $5 from ${name}`}
                    onClick={() => writes.change(id, -500)}
                  >
                    −$5
                  </Button>
                  {to && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={small}
                      aria-label={`Move $5 from ${name} to ${to.name}`}
                      onClick={() => writes.move(id, to.id, 500)}
                    >
                      Move $5 <ArrowRightIcon aria-hidden /> {to.name}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`${small} text-muted-foreground`}
                    aria-label={`Deposit $1 to ${name} from another device`}
                    onClick={() => writes.elsewhere(id)}
                  >
                    +$1 from elsewhere
                  </Button>
                </div>
              )}
              <Refusal reason={refusedAt(id)} />
            </li>
          );
        })}
      </ul>
      {add}
    </div>
  );
});
