import { Link } from '@tanstack/react-router';
import { Badge } from 'kui-toolkit/components/ui/badge';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from 'kui-toolkit/components/ui/sheet';
import { MenuIcon, XIcon } from 'kui-toolkit/lucide';
import { useOnline } from 'pwa-toolkit/react';
import { useState } from 'react';
import { buildLabel, buildPreset, pwaEnabled } from '../lib/build.ts';
import { ScenarioNav } from './scenario-nav.tsx';
import { ThemeToggle } from './theme.tsx';

/** The app icon (public/favicon.svg), inline so it paints offline too. */
function Mark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      width="24"
      height="24"
      className="size-6 shrink-0 rounded-md"
    >
      <rect width="32" height="32" fill="#18181b" />
      <circle cx="16" cy="16" r="13" fill="#8b5cf6" />
      <circle cx="16" cy="16" r="5" fill="#fafafa" />
    </svg>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 touch-manipulation lg:hidden"
            aria-label="Open scenario menu"
            data-testid="nav-menu"
          />
        }
      >
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[min(20rem,85vw)] gap-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
      >
        <div className="flex h-14 items-center justify-between pr-1.5 pl-5">
          <SheetTitle className="text-sm font-semibold">Scenarios</SheetTitle>
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11 touch-manipulation"
                aria-label="Close menu"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </SheetClose>
        </div>
        <div className="px-2 pb-4">
          <ScenarioNav testIdPrefix="menu" onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppHeader() {
  const online = useOnline();
  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-backdrop-filter:bg-background/70"
      style={{ viewTransitionName: 'site-header' }}
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:grid-cols-[auto_1fr_auto] sm:pr-4 lg:px-6">
        <Link
          to="/"
          className="col-start-1 row-start-1 flex min-h-14 items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-testid="nav-home"
        >
          <Mark />
          PWA Playground
        </Link>
        {/* Row two on phones, inline from sm; not focusable, so tab order is unaffected. */}
        <div className="col-span-2 col-start-1 row-start-2 flex flex-wrap items-center gap-1.5 pb-2.5 font-mono sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-end sm:pb-0">
          <Badge
            variant="outline"
            className="font-normal tabular-nums"
            data-testid="build-label"
          >
            build {buildLabel}
          </Badge>
          <Badge
            variant="outline"
            className="font-normal"
            data-testid="build-preset"
          >
            preset {buildPreset}
          </Badge>
          {pwaEnabled ? null : (
            <Badge variant="destructive" data-testid="kill-switch">
              Kill Switch build
            </Badge>
          )}
        </div>
        <div className="col-start-2 row-start-1 flex items-center gap-1 sm:col-start-3 sm:gap-1.5">
          <Badge
            variant={online ? 'secondary' : 'destructive'}
            className="gap-1.5 font-mono font-normal"
            data-testid="online"
          >
            <span
              aria-hidden="true"
              className={
                online
                  ? 'size-1.5 rounded-full bg-positive'
                  : 'size-1.5 rounded-full bg-destructive'
              }
            />
            {online ? 'online' : 'offline'}
          </Badge>
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
