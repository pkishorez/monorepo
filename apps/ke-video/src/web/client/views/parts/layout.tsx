import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useLayoutEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { GestureProvider } from '@kestack/web-platform/ui/input';
import { MoonIcon, SunIcon } from 'lucide-react';
import { router } from '../../../shared/index.ts';
import { Theme } from './theme.ts';

/*
 * The app bar, then the page. The bar stays at the top of every page at
 * every width, under the notch: on its left the app's name, or what a page
 * puts there instead (`AppBar`), such as the way back; on its right the
 * theme switch. Every touch gesture on a page is followed from here.
 */

type Slot = {
  readonly element: HTMLElement | null;
  readonly claim: () => () => void;
};

/**
 * Switches light and dark with every transition held for the switch, so
 * the page changes at once rather than as a cascade of fades.
 */
const instantly = (toggle: () => void) => {
  const still = document.createElement('style');
  still.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.append(still);
  toggle();
  requestAnimationFrame(() => requestAnimationFrame(() => still.remove()));
};

const SlotContext = createContext<Slot>({
  element: null,
  claim: () => () => {},
});

/** What a page shows on the app bar's left, in place of the app's name. */
export function AppBar({ children }: { readonly children: ReactNode }) {
  const { element, claim } = use(SlotContext);
  useLayoutEffect(claim, [claim]);
  return element === null ? null : createPortal(children, element);
}

export function Layout({ children }: { readonly children: ReactNode }) {
  const { toggleTheme } = Theme.useTheme();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((count) => count + 1);
    return () => setClaims((count) => count - 1);
  }, []);
  return (
    <GestureProvider>
      <SlotContext value={{ element, claim }}>
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-40 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
            <div className="gutter mx-auto flex h-[calc(var(--bar-h)-1px)] w-full max-w-[92rem] items-center gap-2">
              {claims === 0 && (
                <Router.Link
                  to={router.List()}
                  className="-ml-2 flex min-h-11 items-center rounded-md px-2 font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  ke-video
                </Router.Link>
              )}
              <div
                ref={setElement}
                className="flex min-w-0 flex-1 items-center gap-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => instantly(toggleTheme)}
                aria-label="Switch theme"
                className="-mr-2 size-11 shrink-0 text-muted-foreground"
              >
                <MoonIcon className="dark:hidden" />
                <SunIcon className="hidden dark:block" />
              </Button>
            </div>
          </header>
          <main className="gutter mx-auto w-full max-w-[92rem] flex-1 pt-5 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pt-8">
            {children}
          </main>
        </div>
      </SlotContext>
    </GestureProvider>
  );
}
