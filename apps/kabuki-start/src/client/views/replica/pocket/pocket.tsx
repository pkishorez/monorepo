import { useChild, View } from '@kestack/kabuki/react';
import type { ChildData } from '@kestack/kabuki/react';
import { Pages, watchedBy } from '../../../../shared/pages/index.ts';
import { EntriesView, Unwatched } from './activity.tsx';
import { LedgerContext, newId } from './ledger.ts';
import { WalletsView } from './wallets.tsx';

/*
 * A Pocket: its wallets, then the activity of the ones watched. While it
 * is the active Account's, every button is a Message to the section, which
 * asks its Action: the change shows at once, and rolls back, with its
 * reason beside where it was asked, if the Worker refuses it. Watching a
 * wallet, in any Pocket, opens its Window.
 */

/** The wallets' rows, for their names in the activity. */
const walletRows = ({ model }: ChildData<typeof Pages.Wallets>) => model.rows;

export const PocketView = View.make(
  Pages.PocketLive,
  ({ root, model, props, children, send }) => {
    const wallets = useChild(children.wallets, walletRows) ?? [];
    const refusedAt = (at: string) =>
      model.refused.find(
        (each) => each.account === props.account && each.at === at,
      )?.reason ?? null;
    return (
      <div {...root} className="space-y-8">
        <LedgerContext.Provider
          value={{
            refusedAt,
            watching: watchedBy(model, props.account),
            watch: (wallet) => send({ _tag: 'Watch', wallet }),
            nameOf: (id) =>
              wallets.find(({ row }) => row.id === id)?.row.name ?? 'a wallet',
            writes: props.writable
              ? {
                  addWallet: (name) =>
                    send({ _tag: 'AddWallet', id: newId(), name }),
                  change: (wallet, amount) =>
                    send({ _tag: 'Change', id: newId(), wallet, amount }),
                  move: (from, to, amount) =>
                    send({ _tag: 'Move', id: newId(), from, to, amount }),
                  remove: (id) => send({ _tag: 'Remove', id }),
                  elsewhere: (wallet) =>
                    send({ _tag: 'Elsewhere', id: newId(), wallet }),
                }
              : null,
          }}
        >
          <WalletsView instance={children.wallets} />
          {wallets.length > 0 &&
            (children.entries ? (
              <EntriesView instance={children.entries} />
            ) : (
              <Unwatched />
            ))}
        </LedgerContext.Provider>
      </div>
    );
  },
);
