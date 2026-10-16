import { AnimatePresence, motion } from 'motion/react';
import { Check, CloudOff, TreeDeciduous } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import { scrollBar } from '@kestack/web-platform/components/scroll-styles';
import type { ReactNode } from 'react';
import { ASSETS, AppLive } from '../story/index.ts';
import { DownloadsView } from './downloads-view.tsx';
import { HomeView } from './home-view.tsx';
import { Button, EASE } from './parts.tsx';

/**
 * The app: a loading screen while Booting, a sign-in screen once it is
 * loaded, and the signed-in app Inside. One screen fades into the next; none
 * moves.
 */
export const AppView = View.make(AppLive, (self) => {
  const { send } = self;
  return (
    // Every screen sits in the one grid cell: one leaving and one coming
    // overlap in place, so nothing is measured or pulled out of the layout.
    <div className="grid h-full grid-cols-1 grid-rows-1 *:col-start-1 *:row-start-1 *:min-h-0">
      <AnimatePresence initial={false}>
        {self._tag === 'Booting' && (
          <Screen key="booting">
            <Mark />
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-base font-medium">Loading assets</h2>
              <p className="text-[13px] text-muted-foreground">
                {self.model.attempts > 1
                  ? `Trying again, attempt ${self.model.attempts}`
                  : 'Getting everything ready'}
              </p>
            </div>
            <Assets loaded={self.state.loaded} />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="mr-1">Network:</span>
              <Button onClick={() => send({ _tag: 'Succeed' })}>
                Succeed now
              </Button>
              <Button onClick={() => send({ _tag: 'Fail' })}>Fail</Button>
            </div>
          </Screen>
        )}
        {self._tag === 'Failed' && (
          <Screen key="failed">
            <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <CloudOff className="size-5" />
            </span>
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-base font-medium">The assets didn't load</h2>
              <p className="text-[13px] text-muted-foreground">
                Check the connection and try again.
              </p>
            </div>
            <Button tone="primary" onClick={() => send({ _tag: 'Retry' })}>
              Try again
            </Button>
          </Screen>
        )}
        {self._tag === 'SignedOut' && (
          <Screen key="signed-out">
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', duration: 0.45, bounce: 0.25 }}
              className="grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500"
            >
              <Check className="size-5" strokeWidth={2.5} />
            </motion.span>
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-base font-medium">Website loaded</h2>
              <p className="text-[13px] text-muted-foreground">
                Please sign in to continue.
              </p>
            </div>
            <Button
              tone="primary"
              busy={self.state.signingIn}
              busyLabel="Signing in…"
              onClick={() => send({ _tag: 'SignIn' })}
            >
              Sign in
            </Button>
          </Screen>
        )}
        {self._tag === 'Inside' && (
          <motion.div
            key="inside"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.12 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="flex flex-col"
          >
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 @lg:px-6">
              <div className="flex items-center gap-2 rounded-full bg-muted py-1 pr-3 pl-1">
                <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {self.state.name.slice(0, 1)}
                </span>
                <span className="text-[13px] font-medium">
                  {self.state.name}
                </span>
              </div>
            </header>
            {/* The gutter is kept on both sides even before it scrolls, so a
                scrollbar coming never narrows or moves what is in it. */}
            <div
              className={`min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges] ${scrollBar('default')}`}
            >
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 @lg:px-6 @lg:py-10">
                <HomeView instance={self.children.home} />
                <DownloadsView instance={self.children.downloads} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/** One whole screen, its content in the middle of the window. */
function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        // In just after the screen before has mostly faded.
        transition: { duration: 0.3, ease: 'easeOut', delay: 0.12 },
      }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }}
      className="flex flex-col items-center justify-center gap-5 px-6 text-center"
    >
      {children}
    </motion.div>
  );
}

function Mark() {
  return (
    <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_4px_16px_-4px_color-mix(in_oklch,var(--color-primary)_40%,transparent)]">
      <TreeDeciduous className="size-5" />
    </span>
  );
}

function Assets({ loaded }: { readonly loaded: ReadonlyArray<string> }) {
  const next = ASSETS.find((asset) => !loaded.includes(asset));
  return (
    <div className="flex w-56 flex-col gap-3">
      <div className="flex h-1 gap-1">
        {ASSETS.map((asset) => (
          <span
            key={asset}
            className="relative flex-1 overflow-hidden rounded-full bg-foreground/10"
          >
            <motion.span
              initial={false}
              animate={{ scaleX: loaded.includes(asset) ? 1 : 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="absolute inset-0 origin-left rounded-full bg-primary"
            />
          </span>
        ))}
      </div>
      <p className="grid h-4 text-xs text-muted-foreground *:col-start-1 *:row-start-1">
        <AnimatePresence initial={false}>
          <motion.span
            key={next ?? 'done'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {next ? `Loading ${next}…` : 'All loaded'}
          </motion.span>
        </AnimatePresence>
      </p>
    </div>
  );
}
