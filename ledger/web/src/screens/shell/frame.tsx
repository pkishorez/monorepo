import { AppShell, useSidebarWidth } from '@kstackz/web-toolkit/recipes/frame';
import { Button } from '@kstackz/web-toolkit/components/button';
import { Toaster } from '@kstackz/web-toolkit/components/sonner';
import { Plus, WifiOff } from '@kstackz/web-toolkit/components/lucide';
import { GestureProvider, GestureZone } from '@kstackz/web-toolkit/input';
import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BindingKeys } from '@kstackz/web-toolkit/recipes/key-bindings';
import { keys } from '@ledger/core/app/commands';
import { appTheme, useGate } from '../../app.ts';
import { placeTitle } from '@ledger/core/app/places';
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

/**
 * Ledger's frame: the App Shell with its sidebar and header, the Page in a
 * Gesture Zone of its own for the Thumb Lock, and over it the sheets. The
 * zones nest: the page's Thumb Lock first, then the shell's sidebar swipe.
 */
export function Frame(props: { readonly children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  // On a desktop, the sidebar's edge resizes it; the width stays per device.
  const [width, setWidth] = useSidebarWidth('ledger:sidebar-width');
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
            width,
            onWidthChange: setWidth,
          }}
          header={{ title: placeTitle(pathname), actions: <HeaderActions /> }}
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
  const { online } = useGate();
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
  const { online } = useGate();
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
