import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ENTER,
  EXIT,
  Flash,
  Message,
  useSteps,
} from '../../../../../components/index.ts';

/*
 * A music app as a tree of Actors. The App's State decides which Child it
 * has: a Login while signed out, a Playlist while signed in. The
 * Playlist's list decides its Songs, one per id. Messages arrive one at a
 * time: signing in brings the Playlist and its Songs, adding an id brings
 * one Song, removing one takes only that Song, and signing out takes the
 * whole branch at once.
 */

const STEPS: ReadonlyArray<{
  readonly signedIn: boolean;
  readonly ids: ReadonlyArray<string>;
  readonly message?: string;
}> = [
  { signedIn: false, ids: [] },
  { signedIn: false, ids: [], message: 'SignedIn' },
  { signedIn: true, ids: ['a', 'b'] },
  { signedIn: true, ids: ['a', 'b'], message: 'Added' },
  { signedIn: true, ids: ['a', 'b', 'c'] },
  { signedIn: true, ids: ['a', 'b', 'c'], message: "Removed { id: 'a' }" },
  { signedIn: true, ids: ['b', 'c'] },
  { signedIn: true, ids: ['b', 'c'], message: 'SignedOut' },
  { signedIn: false, ids: [] },
];
const DURATIONS = [1300, 800, 1600, 800, 1400, 800, 1400, 800, 1600];

export function TreePicture() {
  const [ref, step, round] = useSteps(DURATIONS, 4);
  const now = STEPS[step]!;
  return (
    <div ref={ref} className="grid place-items-center px-4 py-8">
      <div className="w-full max-w-72">
        <div className="flex h-10 items-end justify-center">
          <AnimatePresence mode="popLayout">
            {now.message && (
              <motion.span
                key={`${round}-${step}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0, transition: ENTER }}
                exit={{ opacity: 0, y: 14, transition: EXIT }}
              >
                <Message>{now.message}</Message>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-4 h-60">
          <Node name="App" fact={now.signedIn ? 'Signed in' : 'Signed out'}>
            <AnimatePresence mode="popLayout" initial={false}>
              {now.signedIn ? (
                <Branch key="playlist">
                  <Node
                    name="Playlist"
                    fact={`ids: ${now.ids.join(' ')}`}
                    flash={now.ids.length + round * 10}
                  >
                    <AnimatePresence initial={false}>
                      {now.ids.map((id) => (
                        <Branch key={id}>
                          <Node name={`Song ${id}`} />
                        </Branch>
                      ))}
                    </AnimatePresence>
                  </Node>
                </Branch>
              ) : (
                <Branch key="login">
                  <Node name="Login" />
                </Branch>
              )}
            </AnimatePresence>
          </Node>
        </div>
      </div>
    </div>
  );
}

/** An Actor in the tree: a box, with its Children hanging under it. */
function Node({
  name,
  fact,
  flash,
  children,
}: {
  readonly name: string;
  readonly fact?: string;
  readonly flash?: number;
  readonly children?: ReactNode;
}) {
  return (
    <div>
      <div className="relative flex h-9 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <span className="font-medium">{name}</span>
        {fact && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {fact}
          </span>
        )}
        <Flash at={flash} />
      </div>
      {children && (
        <div className="ml-4 border-l border-border pl-3">{children}</div>
      )}
    </div>
  );
}

/** A Child arriving under its parent, and leaving. */
function Branch({ children }: { readonly children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: ENTER }}
      exit={{ opacity: 0, height: 0, transition: EXIT }}
      className="overflow-hidden pt-2"
    >
      {children}
    </motion.div>
  );
}
