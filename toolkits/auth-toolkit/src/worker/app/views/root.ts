import { createContext, useContext } from 'react';
import type { Account, PageData } from '../api/index.ts';

/** What the root page's View hands the pages' chrome: the Account menu's actions. */
export interface Root {
  /** The Account an action is under way for, or `all`. */
  readonly busy: string | null;
  /** The Account Switch under way: the Account it makes active, and
   * whether it has been under way long enough to show. Shown, the page is
   * dimmed and still. */
  readonly switching: {
    readonly userId: string;
    readonly shown: boolean;
  } | null;
  /** The last page data a Frame drew, kept by it: the brand a page still
   * loading is drawn in. */
  readonly last: { current: PageData | null };
  readonly switchTo: (account: Account) => void;
  readonly signOut: (account: Account) => void;
  readonly signOutAll: () => void;
}

export const RootContext = createContext<Root | null>(null);

export const useRoot = (): Root => {
  const root = useContext(RootContext);
  if (!root) throw new Error('A page is drawn outside the root page');
  return root;
};
