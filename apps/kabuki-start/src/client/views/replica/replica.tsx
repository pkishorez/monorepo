import { View } from '@kestack/kabuki/react';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages } from '../../../shared/pages/index.ts';
import { PageIntro } from '../../components/index.ts';
import { AccountsList } from './accounts/index.ts';
import { PocketView } from './pocket/index.ts';

/*
 * The Replica page, read top to bottom: what a Replica is here, the
 * accounts and how each syncs, and the Pocket of the one picked, which
 * says whether it writes or is read from this device.
 */

const note = 'text-sm text-muted-foreground';

export const ReplicaView = View.make(
  Pages.ReplicaLive,
  ({ root, model, children, send }) => {
    const { caller } = model;
    const shown =
      caller._tag === 'SignedIn' ? (model.picked ?? caller.active) : null;
    const email =
      caller._tag === 'SignedIn'
        ? caller.accounts.find(({ id }) => id === shown)?.email
        : undefined;
    return (
      <div {...root}>
        <PageIntro title="Replica">
          Each account's wallets are kept on this device, so they open and
          change at once, then sync in the background.
        </PageIntro>
        {caller._tag === 'Checking' ? (
          <p className={`flex items-center gap-2 ${note}`}>
            <Spinner /> Checking who is signed in…
          </p>
        ) : caller._tag === 'SignedOut' ||
          !children.pocket ||
          shown === null ? (
          <p className={note}>Sign in to open your Pocket.</p>
        ) : (
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-12">
            <AccountsList
              accounts={caller.accounts}
              active={caller.active}
              shown={shown}
              instances={model.instances}
              show={(account) => send({ _tag: 'Show', account })}
              className="md:sticky md:top-20 md:col-start-2 md:row-start-1 md:self-start"
            />
            <section
              aria-labelledby="replica-pocket"
              className="min-w-0 space-y-6"
            >
              <header className="space-y-1">
                <h2
                  id="replica-pocket"
                  className="truncate text-lg font-semibold tracking-tight"
                >
                  {email ?? 'Pocket'}
                </h2>
                <p className={note}>
                  {shown === caller.active
                    ? 'Active: every change shows at once, and syncs.'
                    : 'Read from this device. Only the active account syncs.'}
                </p>
              </header>
              <PocketView instance={children.pocket} />
            </section>
          </div>
        )}
      </div>
    );
  },
);
