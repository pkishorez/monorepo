import {
  AppShell,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@kstackz/ui-toolkit/components/blocks/app-shell';
import { Link, useLocation } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { appTheme } from '../../../common/theme.ts';
import { GROUPS, HOME, sectionAt } from '../lib/sections.ts';
import { useAppShellTweaks } from '../lib/tweaks.ts';
import { AccountMenu } from './account-menu.tsx';

// The status bar takes the page's color while the sidebar is shut and the
// sidebar's while it's open. Plain sRGB per theme, like the Theme's own
// strip: an installed iOS app stops following theme switches when the strip
// is a color-mix of the OKLCH theme variables.
const STATUS_BAR = {
  shut: 'light-dark(#ffffff, #0a0a0a)', // --background
  open: 'light-dark(#fafafa, #151515)', // --sidebar
};

/**
 * The App Shell Example: the Sections of a small workspace in an App Shell,
 * each of whose parts the Tweaks turn on and off.
 */
export function Example(props: { readonly children: ReactNode }) {
  const [tweaks, Tweaks] = useAppShellTweaks();
  const slug = useLocation({
    select: (location) => location.pathname.split('/')[2],
  });
  const here = (slug === undefined ? undefined : sectionAt(slug)) ?? HOME;
  const [width, setWidth] = useState(256);

  // Without a sidebar the account menu moves to the header's right.
  const account = tweaks.account ? (
    <AccountMenu place={tweaks.sidebar ? 'sidebar' : 'header'} />
  ) : undefined;
  const actions = (
    <>
      {tweaks.sidebar ? null : account}
      <Tweaks />
    </>
  );

  return (
    <>
      <AppShell
        style={{ viewTransitionName: 'example' }}
        swipe={tweaks.swipe}
        statusBar={(open) => (
          <appTheme.StatusBar
            color={open ? STATUS_BAR.open : STATUS_BAR.shut}
          />
        )}
        sidebar={
          tweaks.sidebar
            ? {
                header: tweaks.appLink ? <AppLink /> : undefined,
                nav: GROUPS.map((group) => ({
                  label: tweaks.labels ? group.label : undefined,
                  items: group.sections.map((section) => ({
                    title: section.title,
                    icon: section.icon,
                    active: section.slug === here.slug,
                    render: (
                      <Link
                        to="/app-shell/$section"
                        params={{ section: section.slug }}
                      />
                    ),
                  })),
                })),
                footer: account,
                ...(tweaks.resizable ? { width, onWidthChange: setWidth } : {}),
              }
            : undefined
        }
        header={tweaks.header ? { title: here.title, actions } : undefined}
      >
        {props.children}
      </AppShell>
      {tweaks.header ? null : (
        // No header to hold them: the actions float at the top right.
        <div className="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] right-3 z-50 flex items-center gap-1 rounded-full bg-background/80 p-1 shadow-sm ring-1 ring-foreground/10 backdrop-blur">
          {actions}
        </div>
      )}
    </>
  );
}

/** Atop the sidebar: this Example, and the way back to every Example. */
function AppLink() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" render={<Link to="/" />}>
          <img
            src="/favicon.svg"
            alt=""
            className="size-8 shrink-0 rounded-lg"
          />
          <span className="grid flex-1 text-left leading-tight">
            <span className="truncate font-medium">App Shell</span>
            <span className="truncate text-xs text-muted-foreground">
              All examples
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
