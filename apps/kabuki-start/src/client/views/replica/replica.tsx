import { View } from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages, router } from '../../../shared/pages/index.ts';
import { PageIntro } from '../../components/index.ts';
import { PeekView } from './peek.tsx';
import { PocketView } from './pocket.tsx';
import { SyncView } from './sync.tsx';

/*
 * The Replica page: Your Pocket or Peek, one at a time under two tabs, and
 * the Sync panel beside both.
 */

const tab =
  'rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground';

function Tabs() {
  const { route } = useRouter<typeof router.route.Type>();
  // Peek is a page under Replica: both routes are tagged `Replica`.
  const peeking =
    route._tag === 'Replica' && 'page' in route && route.page?._tag === 'Peek';
  return (
    <nav aria-label="Replica" className="mb-6 flex gap-1">
      <Router.Link
        to={router.Replica()}
        aria-current={peeking ? undefined : 'page'}
        className={tab}
      >
        Your Pocket
      </Router.Link>
      <Router.Link
        to={router.Replica.Peek()}
        aria-current={peeking ? 'page' : undefined}
        className={tab}
      >
        Peek
      </Router.Link>
    </nav>
  );
}

export const ReplicaView = View.make(
  Pages.ReplicaLive,
  ({ root, model, children }) => (
    <div {...root}>
      <PageIntro title="Replica">
        Your wallets are kept on this device: they show at once, change at once,
        and sync in the background.
      </PageIntro>
      <Tabs />
      <div className="grid gap-10 md:grid-cols-[1fr_15rem]">
        <div className="min-w-0">
          {children.Peek ? (
            <PeekView instance={children.Peek} />
          ) : model.caller._tag === 'Checking' ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Checking who is signed in…
            </p>
          ) : model.caller._tag === 'SignedOut' || !children.pocket ? (
            <p className="text-sm text-muted-foreground">
              Sign in to open your Pocket.
            </p>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Pocket for{' '}
                <span className="font-medium text-foreground">
                  {model.caller.email}
                </span>
                . It follows the account you switch to.
              </p>
              <PocketView instance={children.pocket} />
            </div>
          )}
        </div>
        <SyncView instance={children.sync} />
      </div>
    </div>
  ),
);
