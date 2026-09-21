import type { ReactNode } from 'react';

import { Button } from '#components/ui/button';
import { Toaster } from '#components/ui/sonner';
import { cn } from '#lib/utils';

import { AccountSwitcher, type AccountsView } from '../account-switcher';
import { EmailToggle, MaskedEmail } from '../email-privacy';
import { BrandLink, type Branding } from './brand';
import { Loader } from './loader';
import { ThemeToggle } from './theme-toggle';

export { BrandLink, brandName, type Branding } from './brand';
export { MaskedEmail, useEmailPrivacy } from '../email-privacy';

const ACCENT =
  '[--primary:var(--sidebar-active-foreground)] [--primary-foreground:var(--sidebar-active)] [--ring:var(--sidebar-active-foreground)]';

interface ScreenFrameProps {
  branding: Branding;
  loading: boolean;
  title?: ReactNode;
  description?: ReactNode;
  header?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Who is acting on this screen. `onSignOut` only where the screen owns
   * sign-out; with an account switcher present it lives in the switcher. */
  account?: { email: string; onSignOut?: (() => void) | undefined } | undefined;
  /** Shown top-right when the deployment allows several Signed-in Accounts. */
  accounts?: AccountsView | undefined;
}

export function ScreenFrame({
  branding,
  loading,
  title,
  description,
  header,
  children,
  footer,
  account,
  accounts,
}: ScreenFrameProps) {
  return (
    <main
      className={cn(
        ACCENT,
        'flex min-h-svh items-center justify-center px-4 pt-16 pb-6 sm:p-6',
      )}
    >
      <div className="fixed top-4 right-4 z-10 flex items-center gap-1">
        {accounts ? <AccountSwitcher accounts={accounts} /> : null}
        <EmailToggle />
        <ThemeToggle />
      </div>
      <Toaster position="bottom-center" richColors />
      {loading ? (
        <Loader branding={branding} />
      ) : (
        <div className="flex w-full max-w-xl animate-in flex-col gap-4 duration-100 fade-in-0 motion-reduce:animate-none">
          <section className="flex flex-col gap-6 rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 sm:p-8">
            {header ?? (
              <header className="flex flex-col gap-6">
                <BrandLink branding={branding} />
                {title ? (
                  <div className="flex flex-col gap-1.5">
                    <h1 className="text-xl font-semibold tracking-tight text-balance">
                      {title}
                    </h1>
                    {description ? (
                      <p className="text-sm text-pretty text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </header>
            )}
            {children}
            {footer ? <footer>{footer}</footer> : null}
          </section>
          {account ? (
            <p className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
              <span className="truncate">
                Signed in as{' '}
                <span className="text-foreground">
                  <MaskedEmail email={account.email} />
                </span>
              </span>
              {account.onSignOut ? (
                <Button
                  variant="link"
                  size="xs"
                  className="relative h-auto shrink-0 p-0 text-xs text-muted-foreground before:absolute before:-inset-2 hover:text-foreground"
                  onClick={account.onSignOut}
                >
                  Sign out
                </Button>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
