import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Brand, PageData } from '../api/index.ts';
import { cx } from '../ui/index.ts';
import { AccountMenu } from './account-menu.tsx';
import { useRoot } from './root.ts';
import { ThemeToggle } from './theme.tsx';

/*
 * What every page is drawn in, the same on every page: a header with the
 * product's name, the Theme toggle and, once signed in, the Account menu;
 * and the page's column, top-aligned at the same height everywhere.
 * `account` is the Home Page's 640px column; `task` is a single task's
 * 400px one (sign in, approve, an error).
 */

/** Only a colour: anything that could close the rule is dropped. */
const safeColor = (value: string) => value.replace(/[;{}<>\\]/g, '');

/** The product's logo, or its first letter on the accent. */
function BrandMark({ brand }: { brand: Brand }) {
  return brand.logo ? (
    <img
      src={brand.logo}
      alt=""
      width={24}
      height={24}
      className="size-6 shrink-0 rounded-md object-contain"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 select-none place-items-center rounded-md bg-accent text-xs font-semibold text-accent-fg"
    >
      {brand.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

const bar = 'mx-auto w-full max-w-[688px] px-4 sm:px-6';

export function Frame({
  data,
  layout = 'task',
  waited = false,
  children,
}: {
  /** The page's data; null while it loads, or on the not-found page. */
  data: PageData | null;
  layout?: 'account' | 'task';
  /** The data took the place of a loading screen: it fades in, unless the visitor asks for less motion. */
  waited?: boolean;
  children: ReactNode;
}) {
  const root = useRoot();
  const still = useReducedMotion();
  // Loading, the page keeps the brand it was drawn in.
  if (data) root.last.current = data;
  const chrome = data ?? root.last.current;
  const switching = root.switching?.shown === true;
  const brand = chrome?.brand;
  const active = data?.accounts.list.find(
    (account) => account.id === data.accounts.active,
  );
  return (
    <div className="flex min-h-svh flex-col">
      {brand?.accent ? (
        <style>{`:root{--brand-accent:${safeColor(brand.accent)}}`}</style>
      ) : null}
      <header
        className={cx(bar, 'flex h-16 items-center justify-between gap-4')}
      >
        {brand ? (
          <a
            href="/"
            className="-mx-1.5 flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-1.5 font-medium"
          >
            <BrandMark brand={brand} />
            <span className="truncate">{brand.name}</span>
          </a>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {chrome ? (
            <ThemeToggle
              saved={chrome.theme}
              cookieDomain={chrome.cookieDomain}
            />
          ) : null}
          {/* Signed in, the menu's slot is held while the page loads, so nothing moves. */}
          {active || (!data && chrome?.accounts.active) ? (
            <div className="grid size-11 place-items-center">
              {data && active ? (
                <AccountMenu
                  active={active}
                  accounts={data.accounts.list}
                  maxAccounts={data.maxAccounts}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      {/* An Account Switch under way: what is shown is still the Account before's, dimmed and still until the new one's takes its place. */}
      <main
        inert={switching}
        aria-busy={switching ? true : undefined}
        className={cx(
          'mx-auto w-full flex-1 px-4 pt-8 pb-16 transition-opacity duration-150 ease-out sm:px-6 sm:pt-14 motion-reduce:transition-none',
          layout === 'account' ? 'max-w-[688px]' : 'max-w-[448px]',
          switching && 'opacity-50',
        )}
      >
        <motion.div
          initial={waited && !still ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
