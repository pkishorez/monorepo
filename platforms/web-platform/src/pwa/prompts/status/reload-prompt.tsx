import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/alert-dialog';
import { Spinner } from '#components/spinner';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Pwa } from '../../engine/page/index.js';
import { usePwaService } from './status.js';

/*
 * The Reload Prompt: when the app finds it is older than what it talks to,
 * it asks for a reload, and the reader cannot go on without one. Reload
 * moves every open page to the newest build once it is downloaded,
 * checking for it until then; with no service worker it reloads the page.
 */

/** After this long getting the new version, it says the new version is still rolling out. */
export const STILL_ROLLING_OUT_MS = 2 * 60 * 1000;

let asked = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Asks the reader to reload into the newest build, from anywhere: an app
 * calls it when it finds it is older than what it talks to. It opens the
 * Reload Prompt `Pwa` draws, once per page load however often it is
 * called; asked before `PwaProvider` has started, it opens once it has.
 */
export const updateToNewest = (): void => {
  if (asked) return;
  asked = true;
  for (const listener of listeners) listener();
};

type Phase = 'asking' | 'getting' | 'rolling-out';

/**
 * The dialog `updateToNewest` opens: one Reload button, no way to dismiss
 * it, since the app cannot do its work until it reloads.
 */
export const ReloadPrompt = (props: {
  readonly title?: string;
  readonly description?: string;
}): ReactNode => {
  const open = useSyncExternalStore(
    subscribe,
    () => asked,
    () => false,
  );
  const { pwa, started } = usePwaService();
  if (!open || !started) return null;
  return (
    <Asked
      pwa={pwa}
      title={props.title ?? 'This app was updated'}
      description={
        props.description ?? 'Reload to keep going. Nothing is lost.'
      }
    />
  );
};

function Asked(props: {
  readonly pwa: Pwa['Service'] | null;
  readonly title: string;
  readonly description: string;
}) {
  const [phase, setPhase] = useState<Phase>('asking');
  const reload = useRef<HTMLButtonElement>(null);
  const moving = useRef<Fiber.Fiber<void> | null>(null);

  useEffect(() => {
    if (phase !== 'getting') return;
    const wait = setTimeout(
      () => setPhase('rolling-out'),
      STILL_ROLLING_OUT_MS,
    );
    return () => clearTimeout(wait);
  }, [phase]);

  useEffect(
    () => () => {
      const fiber = moving.current;
      if (fiber !== null) Effect.runFork(Fiber.interrupt(fiber));
    },
    [],
  );

  const accept = () => {
    if (phase !== 'asking') return;
    setPhase('getting');
    if (props.pwa === null) window.location.reload();
    else moving.current = Effect.runFork(props.pwa.reloadToNewest);
  };

  const busy = phase !== 'asking';
  return (
    // Open until the page reloads: Escape and a press outside do nothing.
    <AlertDialog open>
      <AlertDialogContent initialFocus={reload} finalFocus={false}>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {phase === 'rolling-out'
              ? 'The new version is still rolling out. This page reloads as soon as it is ready, and nothing is lost.'
              : props.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Says what the busy button is doing to a screen reader. */}
        <p role="status" className="sr-only">
          {phase === 'getting'
            ? 'Getting the new version…'
            : phase === 'rolling-out'
              ? 'The new version is still rolling out.'
              : ''}
        </p>
        <AlertDialogFooter>
          {/* Focusable while busy, so focus stays on it; on touch, a 44px hit area. */}
          <AlertDialogAction
            ref={reload}
            className="min-h-11 touch-manipulation sm:min-h-0"
            disabled={busy}
            focusableWhenDisabled
            onClick={accept}
          >
            {busy && <Spinner aria-hidden="true" role={undefined} />}
            {busy ? 'Getting the new version…' : 'Reload'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
