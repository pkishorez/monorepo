import { Router } from '@kestack/kabuki/routing';
import { useAppShell } from '@kestack/web-platform/recipes/frame';
import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import {
  ChevronRightIcon,
  MoonIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { type ReactNode, useEffect, useState } from 'react';
import * as routes from '../../../../../../routes/index.ts';
import { Theme } from '../../../../../../../ui/page/theme/index.ts';

/*
 * The sidebar's foot, on a phone only: two round buttons, a thumb's reach
 * apart, raised over the timeline. On the left, You: a Drawer with who is
 * signed in, the theme, and Settings, which shuts the sidebar over the
 * page, as a Session's row does. On the right, New project, the Project
 * Picker's own trigger. A wide screen has the first three in its header
 * and Open project at the top of the sidebar. Each sinks as it
 * is pressed, and on a phone that can, taps back.
 *
 * Who is signed in is one row; it opens the Accounts, the Account
 * Switcher's list, in a Drawer on top of this one, which closes back to it.
 * Once another Account is active, both close.
 */

/** A light tap back, where the phone can. */
export const tapBack = () => navigator.vibrate?.(8);

const nameOf = (email: string) => email.split('@')[0] || email;

export function Foot({
  email,
  accounts,
  projectPicker,
}: {
  /** Who is signed in. */
  readonly email: string;
  /** The Account Switcher's list, for the Drawer on top. */
  readonly accounts: ReactNode;
  /** The Project Picker, drawn by its trigger. */
  readonly projectPicker: ReactNode;
}) {
  const [you, setYou] = useState(false);
  const shell = useAppShell();
  const [switching, setSwitching] = useState(false);
  // Another Account active, switched to or just added: both Drawers close,
  // so the foot shows who it is now.
  useEffect(() => {
    setSwitching(false);
    setYou(false);
  }, [email]);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-5 pb-3 md:hidden">
        <button
          type="button"
          aria-label="You, theme and settings"
          aria-expanded={you}
          onPointerDown={tapBack}
          onClick={() => setYou(true)}
          className="focus-ring pointer-events-auto grid size-14 place-items-center rounded-full bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.16),0_6px_20px_rgb(0_0_0/0.22)] ring-1 ring-border transition-[transform,box-shadow] duration-150 ease-out active:scale-90 active:shadow-[0_1px_2px_rgb(0_0_0/0.16)] motion-reduce:transition-none [&_svg]:size-6"
        >
          <SlidersHorizontalIcon aria-hidden />
        </button>
        <div className="pointer-events-auto" onPointerDown={tapBack}>
          {projectPicker}
        </div>
      </div>
      <Drawer open={you} onOpenChange={(open) => setYou(open)} label="You">
        <div className="flex flex-col gap-5 px-4 pt-1 pb-4">
          <button
            type="button"
            onClick={() => setSwitching(true)}
            className="focus-ring flex min-w-0 items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-muted/60 motion-reduce:transition-none"
          >
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-lg font-medium"
            >
              {nameOf(email).charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[17px] font-semibold">
                {nameOf(email)}
              </span>
              <span className="truncate text-[13px] text-muted-foreground">
                {email}
              </span>
            </span>
            <span className="shrink-0 text-[13px] text-muted-foreground">
              Switch
            </span>
            <ChevronRightIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground/60"
            />
          </button>
          <ThemeChoice />
          <Router.Link
            to={routes.settings()}
            onClick={() => {
              setYou(false);
              if (shell.isMobile) shell.setOpen(false);
            }}
            className="focus-ring flex h-14 items-center gap-3.5 border-y border-border/70 px-2 text-[17px] transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-muted/60 motion-reduce:transition-none"
          >
            <SettingsIcon
              aria-hidden
              className="size-5 text-muted-foreground"
            />
            <span className="flex-1">Settings</span>
            <ChevronRightIcon
              aria-hidden
              className="size-4 text-muted-foreground/60"
            />
          </Router.Link>
        </div>
        <Drawer
          open={switching}
          onOpenChange={(open) => setSwitching(open)}
          label="Accounts"
        >
          {accounts}
        </Drawer>
      </Drawer>
    </>
  );
}

/** Light and Dark, side by side, the one on ringed. */
function ThemeChoice() {
  const { theme, setTheme } = Theme.useTheme();
  const options = [
    { value: 'light', label: 'Light', Icon: SunIcon },
    { value: 'dark', label: 'Dark', Icon: MoonIcon },
  ] as const;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-2 gap-2"
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => {
            tapBack();
            setTheme(value);
          }}
          className={cn(
            'focus-ring flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] text-muted-foreground ring-1 ring-border transition-[color,box-shadow,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none',
            'aria-checked:text-foreground aria-checked:ring-2 aria-checked:ring-foreground',
          )}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
