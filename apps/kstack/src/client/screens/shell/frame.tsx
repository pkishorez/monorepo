import { AppShell } from '@kstackz/ui-toolkit/components/blocks/app-shell';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Toaster } from '@kstackz/ui-toolkit/components/ui/sonner';
import { Plus, WifiOff } from '@kstackz/ui-toolkit/lucide';
import { GestureProvider, GestureZone } from '@kstackz/use-gesture';
import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BindingKeys, keys } from '../../commands/index.ts';
import { appTheme } from '../../state/settings/index.ts';
import { useOnline } from '../../state/session/index.ts';
import { isMonthKey, monthName } from '../../../domain/ledger/index.ts';
import { AccountSheet } from '../sheets/accounts/index.ts';
import { AddSheet } from '../sheets/add/index.ts';
import { Palette } from '../sheets/palette/index.ts';
import { Page } from '../parts/index.ts';
import { Globals } from './globals.tsx';
import { SidebarContent, SidebarFooter } from './sidebar.tsx';
import { UserSwitcher } from './user-switcher.tsx';
import { Thumb } from './thumb.tsx';
import { KeyBar } from './key-bar.tsx';

// The status bar takes the page's colour while the sidebar is shut and the
// sidebar's while it is open: plain sRGB, as an installed iOS app needs.
const STATUS_BAR = {
  shut: 'light-dark(#ffffff, #0a0a0a)',
  open: 'light-dark(#fafafa, #151515)',
};

const titleOf = (pathname: string) => {
  const [, place, part] = pathname.split('/');
  if (place === 'entries') return part ? 'Entry' : 'Entries';
  if (place === 'months')
    return part && isMonthKey(part) ? monthName(part) : 'Months';
  if (place === 'settings') return 'Settings';
  return 'Home';
};

/**
 * Ledger's frame: the App Shell with its sidebar and header, the Page in a
 * Gesture Zone of its own for the Thumb Lock, and over it the sheets. The
 * zones nest: the page's Thumb Lock first, then the shell's sidebar swipe.
 */
export function Frame(props: { readonly children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <GestureProvider>
      <GestureZone className="h-dvh">
        <AppShell
          statusBar={(open) => (
            <appTheme.StatusBar
              color={open ? STATUS_BAR.open : STATUS_BAR.shut}
            />
          )}
          sidebar={{
            header: <UserSwitcher />,
            content: <SidebarContent />,
            footer: <SidebarFooter />,
          }}
          header={{ title: titleOf(pathname), actions: <HeaderActions /> }}
        >
          <GestureZone className="flex min-h-full flex-col">
            <Globals />
            <Thumb />
            <Page>{props.children}</Page>
            <AddButton />
          </GestureZone>
        </AppShell>
        <AddSheet />
        <AccountSheet />
        <Palette />
        <KeyBar />
        <Toaster position="top-center" />
      </GestureZone>
    </GestureProvider>
  );
}

// Offline, quietly; and Add, where a pointer can reach the header.
function HeaderActions() {
  const run = keys.useRun();
  const { actions } = keys.useStatus();
  const online = useOnline();
  const add = actions.find((action) => action.id === 'addEntry')?.bindings[0]
    ?.binding;
  return (
    <>
      {!online && (
        <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <WifiOff className="size-3.5" aria-hidden="true" /> Offline
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="hidden gap-2 keyboard:inline-flex"
        disabled={!online}
        onClick={() => run('addEntry')}
      >
        <Plus aria-hidden="true" />
        Add
        {add && <BindingKeys binding={add} />}
      </Button>
    </>
  );
}

// On a touch screen: the one button, at the thumb.
function AddButton() {
  const run = keys.useRun();
  const online = useOnline();
  return (
    <button
      type="button"
      aria-label="Add an entry"
      disabled={!online}
      onClick={() => run('addEntry')}
      className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] z-30 hidden size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:opacity-40 touch:grid"
    >
      <Plus className="size-6" aria-hidden="true" />
    </button>
  );
}
