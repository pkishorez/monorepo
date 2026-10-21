import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/pages/index.ts';
import { EntriesView, LedgerContext, newId, WalletsView } from './ledger.tsx';

/*
 * Your Pocket: the Pocket section's wallets and entries, with every write.
 * Each write is a Message to the section, which asks its Action; the change
 * shows at once and rolls back, with its reason, if the Worker refuses it.
 */

export const PocketView = View.make(
  Pages.PocketLive,
  ({ root, model, props, children, send }) => {
    const selected =
      model.selected?.account === props.account ? model.selected.wallet : null;
    return (
      <div {...root}>
        <LedgerContext.Provider
          value={{
            selected,
            select: (wallet) => send({ _tag: 'Select', wallet }),
            entries: children.entries && (
              <EntriesView instance={children.entries} />
            ),
            writes: {
              refused:
                model.refused?.account === props.account ? model.refused : null,
              newWallet: (name) =>
                send({ _tag: 'NewWallet', id: newId(), name }),
              rename: (id, name) => send({ _tag: 'Rename', id, name }),
              post: (walletId, amount, note) =>
                send({ _tag: 'Move', id: newId(), walletId, amount, note }),
              transfer: (from, to, amount, note) =>
                send({ _tag: 'Send', id: newId(), from, to, amount, note }),
              remove: (id) => send({ _tag: 'Remove', id }),
            },
          }}
        >
          <WalletsView instance={children.wallets} />
        </LedgerContext.Provider>
      </div>
    );
  },
);
