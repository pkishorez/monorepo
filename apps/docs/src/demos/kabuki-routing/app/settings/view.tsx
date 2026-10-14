import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Route, Router, useRouter } from '@kestack/kabuki/routing';
import type { RouterState } from '@kestack/kabuki/routing';
import { Routes } from '../../routes/index.ts';
import type { Route as AppRoute } from '../../routes/index.ts';
import { Case, Page, Running, tab } from '../../parts/index.ts';
import { BillingView } from './billing/index.ts';
import { Profile } from './profile/index.ts';
import { Settings } from './settings.ts';

const ORDER = ['Profile', 'Billing'];
const EASE = [0.32, 0.72, 0, 1] as const;

type Move = RouterState<AppRoute>['move'];

/** The section of settings a Route is in: Profile where the URL ends at settings, none outside it. */
const sectionOf = (route: AppRoute | null) =>
  route?._tag === 'Settings' ? (route.page?._tag ?? 'Profile') : null;

/** Which way a section slides: on toward the later tab, back toward the earlier one. */
const offset = (move: Move) => {
  const from = sectionOf(move.from);
  const to = sectionOf(move.to);
  if (move.how === 'load' || !from || !to) return 0;
  return ORDER.indexOf(to) > ORDER.indexOf(from) ? 24 : -24;
};

const slide = {
  enter: (move: Move) => ({ x: offset(move), opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (move: Move) => ({ x: -offset(move), opacity: 0 }),
};

/** One section, slid in the way the router's last move went. */
function Sliding({
  section,
  children,
}: {
  readonly section: string;
  readonly children: ReactNode;
}) {
  const { move } = useRouter<AppRoute>();
  return (
    <AnimatePresence initial={false} custom={move}>
      <motion.div
        key={section}
        custom={move}
        variants={slide}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export const SettingsView = Route.view(Settings, (self) => {
  const { page } = self.props.route;
  const { profile, Billing } = self.children;
  return (
    <div {...self.root}>
      <Page title="Settings">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <nav className="flex gap-1">
            <Router.Link
              className={tab}
              aria-current={page ? undefined : 'page'}
              to={Routes.Settings()}
            >
              Profile
            </Router.Link>
            <Router.Link
              className={tab}
              aria-current={page?._tag === 'Billing' ? 'page' : undefined}
              to={Routes.Settings.Billing()}
            >
              Billing
            </Router.Link>
          </nav>
          <Running name="autosave" count={self.model.saves} />
        </div>
        <div className="grid *:col-start-1 *:row-start-1">
          <Sliding section={page?._tag ?? 'Profile'}>
            {profile && <Profile.view instance={profile} />}
            {Billing && <BillingView instance={Billing} />}
          </Sliding>
        </div>
        <Case title="Pages inside pages, and how they move">
          Settings is the wrapper: its autosave keeps counting as you move
          between Profile and Billing, and inside Billing between Plan and
          Invoices. Each section slides the way you moved, read from the
          router's last move.
        </Case>
      </Page>
    </div>
  );
});
