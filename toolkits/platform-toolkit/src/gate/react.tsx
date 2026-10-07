import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from 'react';
import type { NamedChoice } from '@kstackz/auth-toolkit/client';
import type { GateView } from './domain/index.js';
import type { Gate } from './gate.js';

type Open<S> = Extract<GateView<S>, { kind: 'open' }>;
type NotOpen<S> = Exclude<GateView<S>, { kind: 'open' }>;

const CHECKING = { kind: 'checking' } as const;

/**
 * A Gate as React sees it, on any platform: `SignedIn` and `SignedOut`
 * around any part of the app, from the whole of it to one button;
 * `useGate` anywhere; `useAccounts` and `useSession` inside `SignedIn`. Nothing runs until one of them first renders.
 */
export const gateReact = <S,>(gate: Gate<S>) => {
  const OpenContext = createContext<Open<S> | undefined>(undefined);

  // What the Gate shows now; checking until it runs.
  const useView = (): GateView<S> =>
    useSyncExternalStore(gate.subscribe, gate.view, () => CHECKING);

  const useOpen = () => {
    const open = useContext(OpenContext);
    if (open === undefined)
      throw new Error('useSession and useAccounts must be inside SignedIn');
    return open;
  };

  /**
   * Renders `children` while an account is open, `fallback` otherwise (a
   * node, or one per view). Everything inside remounts on an Account
   * Switch, so wrap as little as the part that needs an account.
   */
  function SignedIn(props: {
    readonly children: ReactNode;
    readonly fallback?: ReactNode | ((view: NotOpen<S>) => ReactNode);
  }) {
    const view = useView();
    if (view.kind !== 'open') {
      const { fallback } = props;
      return typeof fallback === 'function'
        ? fallback(view as NotOpen<S>)
        : (fallback ?? null);
    }
    return (
      <OpenContext key={view.account.user.id} value={view}>
        {props.children}
      </OpenContext>
    );
  }

  /** Renders `children` only while nobody is signed in. */
  function SignedOut(props: { readonly children: ReactNode }) {
    return useView().kind === 'signedOut' ? props.children : null;
  }

  const dismissNotice = () => void gate.takeNotice();
  const answer = (choice: NamedChoice | null) =>
    gate.namedSignIn.answer(choice);

  /**
   * The Gate, anywhere: what it shows, the Backend it runs on and changing
   * it, whether the device is online, the oldest Gate Notice, the Named
   * Sign-In's question, and what can be done before anyone is open.
   */
  const useGate = () => ({
    view: useView(),
    /** The Backend running; null until it has started. */
    backend: useSyncExternalStore(gate.subscribe, gate.backend, () => null),
    /** Chooses a Backend and runs on it at once. */
    setBackend: gate.setBackend,
    /** Whether the device is online. */
    online: useSyncExternalStore(gate.onOnlineChange, gate.online, () => true),
    /** The oldest Gate Notice not yet dismissed. */
    notice: useSyncExternalStore(gate.subscribe, gate.notice, () => null),
    dismissNotice,
    /** Asks the Backend again who is signed in. */
    checkAgain: gate.checkAgain,
    /** Tries again to open an account that would not open. */
    retry: gate.retry,
    /** Signs an account in, the first or one more. */
    signIn: gate.addAccount,
    /** An Account Switch, as from an Account Lost, where nobody is open. */
    switchTo: gate.switchTo,
    /** Signs the Active Account out, or forgets a lost one; false when the
     * Backend can't be reached. */
    signOut: gate.signOut,
    /** Whether the device Backend is asking who signs in, and the answer: a
     * choice, or null to sign nobody in. */
    namedSignIn: {
      asking: useSyncExternalStore(
        gate.namedSignIn.subscribe,
        gate.namedSignIn.isAsking,
        () => false,
      ),
      answer,
    },
  });

  /**
   * The Signed-in Accounts, and what is done with them; only inside
   * `SignedIn`.
   */
  const useAccounts = () => {
    const open = useOpen();
    return {
      /** The open account. */
      current: open.account,
      /** Every Signed-in Account. */
      all: open.accounts,
      /** Signs one more account in, who becomes the Active Account. */
      add: gate.addAccount,
      /** An Account Switch, at once. */
      switchTo: gate.switchTo,
      /** False when the Backend can't be reached. */
      signOut: gate.signOut,
      /** False when the Backend can't be reached. */
      signOutEveryone: gate.signOutEveryone,
    };
  };

  return {
    SignedIn,
    SignedOut,
    useGate,
    useAccounts,
    /** The open Account's Session; only inside `SignedIn`. */
    useSession: (): S => useOpen().session,
  };
};

/** A Gate's React side, as `gateReact` makes it. */
export type GateReact<S> = ReturnType<typeof gateReact<S>>;
