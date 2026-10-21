import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/pages/index.ts';
import { EntriesView, LedgerContext, WalletsView } from './ledger.tsx';

/*
 * Peek: pick another signed-in Account, and read its Pocket as this device
 * keeps it. Nothing here writes, and nothing is fetched for it.
 */

export const PeekView = View.make(
  Pages.PeekLive,
  ({ root, model, children, send }) => (
    <div {...root} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Read from this device. Not fetched: only the active account syncs.
      </p>
      {model.others.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sign in a second account from the header to peek at it.
        </p>
      ) : (
        <div
          role="group"
          aria-label="Account to peek at"
          className="flex flex-wrap gap-2"
        >
          {model.others.map(({ id, email }) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === model.picked}
              onClick={() => send({ _tag: 'Pick', account: id })}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-foreground aria-pressed:text-foreground"
            >
              {email}
            </button>
          ))}
        </div>
      )}
      {children.wallets && (
        <LedgerContext.Provider
          value={{
            selected: model.selected,
            select: (wallet) => send({ _tag: 'Select', wallet }),
            entries: children.entries && (
              <EntriesView instance={children.entries} />
            ),
            writes: null,
          }}
        >
          <WalletsView instance={children.wallets} />
        </LedgerContext.Provider>
      )}
    </div>
  ),
);
