import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useAppShell,
} from '@kstackz/ui-toolkit/components/blocks/app-shell';
import { Plus, Settings } from '@kstackz/ui-toolkit/lucide';
import { Link, useLocation, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { BindingKeys } from '../../kit/keyboard/index.ts';
import { keys, useCommand } from '@ledger/core/client/commands';
import { useMoney } from '@ledger/core/client/session';
import { balances } from '@ledger/core/shared/ledger';
import { useOpenAccount } from '../sheets/accounts/index.ts';
import { AccountIcon, Amount, focusPage } from '../parts/index.ts';
import { PLACES } from './places.ts';

// Every Place but Settings, which sits at the foot of the Sidebar.
const TOP = PLACES.filter((place) => place.to !== '/settings');

// What the Sidebar's keys move through, top to bottom.
const ITEM = '[data-sidebar-item]';

// The first key of a Command, as the user has it now.
const useKeyOf = () => {
  const { actions } = keys.useStatus();
  return (id: string) =>
    actions.find((action) => action.id === id)?.bindings[0]?.binding;
};

/** The Places, then each Account with its balance, and a way to add one. */
export function SidebarContent() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { account?: string };
  const money = useMoney();
  const keyOf = useKeyOf();
  const openAccount = useOpenAccount();
  const balance = balances(money.accounts, money.entries);
  const currency = money.currency;
  const here = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to);
  useSidebarKeys();

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {TOP.map((place) => {
              const binding = keyOf(place.command);
              return (
                <SidebarMenuItem key={place.to}>
                  <SidebarMenuButton
                    data-sidebar-item=""
                    isActive={here(place.to) && search.account === undefined}
                    render={<Link to={place.to} />}
                  >
                    <place.icon aria-hidden />
                    <span className="flex-1">{place.label}</span>
                    {binding && (
                      <BindingKeys binding={binding} className="opacity-60" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {money.ready && (
        <SidebarGroup>
          <SidebarGroupLabel className="justify-between pr-0">
            Accounts
            <button
              type="button"
              aria-label="Add an account"
              onClick={() => openAccount()}
              className="focus-ring grid size-7 place-items-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {money.accounts.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    data-sidebar-item=""
                    className="text-muted-foreground"
                    onClick={() => openAccount()}
                  >
                    <Plus aria-hidden />
                    <span>Add an account</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {money.accounts.map((account) => (
                <SidebarMenuItem key={account.id}>
                  <SidebarMenuButton
                    data-sidebar-item=""
                    isActive={search.account === account.id}
                    render={
                      <Link to="/entries" search={{ account: account.id }} />
                    }
                  >
                    <AccountIcon kind={account.kind} />
                    <span className="flex-1 truncate">{account.name}</span>
                    <Amount
                      cents={balance.get(account.id) ?? 0}
                      currency={currency}
                      className="text-xs text-muted-foreground"
                    />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}

/** Settings, at the foot of the sidebar. */
export function SidebarFooter() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const binding = useKeyOf()('toSettings');
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          data-sidebar-item=""
          isActive={pathname.startsWith('/settings')}
          render={<Link to="/settings" />}
        >
          <Settings aria-hidden />
          <span className="flex-1">Settings</span>
          {binding && <BindingKeys binding={binding} className="opacity-60" />}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * The Sidebar's keys. Space E gives it the keys, opening it if shut, and
 * focuses where you are in it; J and K move, Enter goes. Escape gives the
 * keys back to exactly what had them, and shuts the Sidebar again if it
 * was shut. Going somewhere, or focus leaving it, gives them to the page.
 */
function useSidebarKeys() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const { open, setOpen } = useAppShell();
  const href = useLocation({ select: (location) => location.href });
  const came = useRef<{
    readonly focus: Element | null;
    readonly shut: boolean;
  }>(undefined);
  const active = surface === 'sidebar';

  const items = () => [
    ...document.querySelectorAll<HTMLElement>(
      `[data-slot=app-shell-sidebar] ${ITEM}`,
    ),
  ];
  const leave = (focus: 'back' | 'page') => {
    const was = came.current;
    came.current = undefined;
    closeSurface('sidebar');
    if (was?.shut) setOpen(false);
    const target = was?.focus;
    if (
      focus === 'back' &&
      target instanceof HTMLElement &&
      target.isConnected &&
      target !== document.body
    )
      target.focus({ preventScroll: true });
    else focusPage();
  };

  useCommand('focusSidebar', () => {
    came.current = { focus: document.activeElement, shut: !open };
    if (!open) setOpen(true);
    openSurface('sidebar');
    // A shut sidebar is inert: focus it once it opens.
    const focus = (tries: number) => {
      const list = items();
      const target =
        list.find((item) => item.matches('[data-active]')) ?? list[0];
      target?.focus({ preventScroll: true });
      if (document.activeElement !== target && tries > 0)
        requestAnimationFrame(() => focus(tries - 1));
    };
    focus(20);
  });

  const move = (by: number) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    list[(at + by + list.length) % list.length]?.focus();
  };
  useCommand('sidebar.down', () => move(1), { enabled: active });
  useCommand('sidebar.up', () => move(-1), { enabled: active });
  useCommand('sidebar.leave', () => leave('back'), { enabled: active });

  // Enter on a Place went there: the page has the keys now.
  const latest = useRef({ active, leave });
  latest.current = { active, leave };
  const went = useRef(href);
  useEffect(() => {
    if (went.current === href) return;
    went.current = href;
    if (latest.current.active) latest.current.leave('page');
  }, [href]);

  // A click on the page takes focus, and the keys follow it.
  useEffect(() => {
    if (!active) return;
    const onFocus = (event: FocusEvent) => {
      const sidebar = document.querySelector('[data-slot=app-shell-sidebar]');
      const target = event.target as Node;
      if (sidebar?.contains(target)) return;
      // Dialogs opened from the Sidebar come back to it.
      if ((target as Element).closest?.('[role=dialog]')) return;
      came.current = undefined;
      closeSurface('sidebar');
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [active, closeSurface]);
}
