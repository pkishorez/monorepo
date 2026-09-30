import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { ArrowLeftIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureProvider, GestureZone } from '@kstackz/use-gesture';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'motion/react';
import type { ReactNode } from 'react';
import { appTheme } from '../../common/theme.ts';
import { Bar } from './bar/index.ts';
import { FEATURES } from './list.ts';

const featureAt = (slug: string) => FEATURES.find((f) => f.slug === slug);

/** Whether a Feature lives at this slug. */
export const hasFeature = (slug: string) => featureAt(slug) !== undefined;

/**
 * The Features Showcase's own page: every Feature, as a card. A swipe right
 * anywhere on it goes back to every Showcase.
 */
export function FeatureList() {
  return (
    <GestureProvider>
      <GestureZone
        className="min-h-dvh overflow-x-clip pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
        style={{ viewTransitionName: 'showcase' }}
      >
        <appTheme.StatusBar />
        <SwipeHome>
          <header className="mx-auto box-content flex h-14 max-w-5xl items-center gap-1 px-2 pt-[env(safe-area-inset-top)]">
            <Link
              to="/"
              aria-label="All showcases"
              className={buttonVariants({
                variant: 'ghost',
                size: 'icon',
                className: 'size-11 md:size-9',
              })}
            >
              <ArrowLeftIcon aria-hidden="true" />
            </Link>
            <h1 className="text-[15px] font-semibold tracking-tight">
              Features
            </h1>
          </header>
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-3 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:grid-cols-3 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <li key={feature.slug}>
                <Link
                  to="/features/$feature"
                  params={{ feature: feature.slug }}
                  className="flex aspect-square flex-col justify-between rounded-xl bg-card p-4 ring-1 ring-edge transition-shadow duration-150 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <feature.icon
                    aria-hidden="true"
                    className="size-6 text-muted-foreground"
                  />
                  <span className="font-medium">{feature.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SwipeHome>
      </GestureZone>
    </GestureProvider>
  );
}

const SPRING = { type: 'spring', visualDuration: 0.25, bounce: 0 } as const;
const POP = { type: 'spring', visualDuration: 0.3, bounce: 0.4 } as const;

/**
 * A swipe right goes home. As it's under way the page leans right and fades,
 * and a back arrow slides in from the left edge, its ring filling with the
 * distance. Once letting go would go home it locks: the arrow fills and pops,
 * with a tap on phones that can, and the page dims further.
 */
function SwipeHome(props: { readonly children: ReactNode }) {
  const navigate = useNavigate();
  const pull = useMotionValue(0);
  const locked = useMotionValue(0);
  const swipe = useSwipe({
    direction: 'right',
    onCommit: () => navigate({ to: '/' }),
    onCancel: () => {
      animate(pull, 0, SPRING);
      animate(locked, 0, SPRING);
    },
  });
  // Past the commit distance it gives a little more, then stops.
  useMotionValueEvent(swipe.progress, 'change', (progress) => {
    pull.set(progress <= 1 ? progress : 1 + Math.min(progress - 1, 1) / 4);
  });
  useMotionValueEvent(swipe.willCommit, 'change', (armed) => {
    animate(locked, armed ? 1 : 0, armed ? POP : SPRING);
    if (armed) navigator.vibrate?.(8);
  });

  const pageX = useTransform(pull, (value) => value * 32);
  const pageOpacity = useTransform(
    [pull, locked],
    ([value = 0, lock = 0]: ReadonlyArray<number>) =>
      1 - Math.min(value, 1) * 0.3 - lock * 0.2,
  );
  const arrowX = useTransform(pull, [0, 1], [-56, 20]);
  const arrowOpacity = useTransform(pull, [0, 0.3], [0, 1]);
  const ring = useTransform(pull, (value) => Math.min(value, 1));
  const scale = useTransform(locked, [0, 1], [1, 1.15]);
  return (
    <>
      <motion.div style={{ x: pageX, opacity: pageOpacity }}>
        {props.children}
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed top-1/2 left-0 -mt-6 size-12"
        style={{ x: arrowX, opacity: arrowOpacity, scale }}
      >
        <div className="absolute inset-1 rounded-full bg-popover shadow-md" />
        <motion.div
          className="absolute inset-1 rounded-full bg-foreground"
          style={{ opacity: locked }}
        />
        <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
          <circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            strokeWidth="2"
            className="stroke-foreground/10"
          />
          <motion.circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="stroke-foreground"
            style={{ pathLength: ring }}
          />
        </svg>
        <ArrowLeftIcon className="absolute inset-0 m-auto size-5 text-foreground" />
        <motion.span className="absolute inset-0" style={{ opacity: locked }}>
          <ArrowLeftIcon className="absolute inset-0 m-auto size-5 text-background" />
        </motion.span>
      </motion.div>
    </>
  );
}

/**
 * One Feature, over the whole screen, in its own Gesture Provider, with the
 * bar that leads back, lists what to try and shows its code.
 */
export function FeatureScreen(props: { readonly slug: string }) {
  const feature = featureAt(props.slug);
  if (feature === undefined) return null;
  return (
    <GestureProvider>
      <feature.App />
      <Bar feature={feature} />
    </GestureProvider>
  );
}
