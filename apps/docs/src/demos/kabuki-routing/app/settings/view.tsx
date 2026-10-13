import { AnimatePresence, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import type { Move } from '@kestack/kabuki/routing';
import { Routes } from '../../routes/index.ts';
import { Case, Page, Running, tab } from '../../parts/index.ts';
import { SettingsActor, pages } from './settings.ts';

const ORDER = ['Profile', 'Billing'];
const EASE = [0.32, 0.72, 0, 1] as const;

/** Which way a section slides: on toward the later tab, back toward the earlier one. */
const offset = (move: Move<{ readonly _tag: string }>) => {
  if (move.how === 'load' || !move.from || !move.to) return 0;
  return ORDER.indexOf(move.to._tag) > ORDER.indexOf(move.from._tag) ? 24 : -24;
};

const slide = {
  enter: (move: Move<{ readonly _tag: string }>) => ({
    x: offset(move),
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (move: Move<{ readonly _tag: string }>) => ({
    x: -offset(move),
    opacity: 0,
  }),
};

export const SettingsView = View.make(SettingsActor, (self) => (
  <div {...self.root}>
    <Page title="Settings">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <nav className="flex gap-1">
          <Router.Link
            className={tab}
            aria-current={
              self.props.page._tag === 'Profile' ? 'page' : undefined
            }
            to={Routes.Settings.Profile()}
          >
            Profile
          </Router.Link>
          <Router.Link
            className={tab}
            aria-current={
              self.props.page._tag === 'Billing' ? 'page' : undefined
            }
            to={Routes.Settings.Billing.Plan()}
          >
            Billing
          </Router.Link>
        </nav>
        <Running name="autosave" count={self.model.saves} />
      </div>
      <div className="grid *:col-start-1 *:row-start-1">
        <pages.View of={self}>
          {(page, move) => (
            <AnimatePresence initial={false} custom={move}>
              {page && (
                <motion.div
                  key={page.key}
                  custom={move}
                  variants={slide}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  {page.element}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </pages.View>
      </div>
      <Case title="Pages inside pages, and how they move">
        Settings is the wrapper: its autosave keeps counting as you move between
        Profile and Billing, and inside Billing between Plan and Invoices. Each
        section slides the way you moved, read from the router's last move at
        this level.
      </Case>
    </Page>
  </div>
));
