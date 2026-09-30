import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { ArrowLeftIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureProvider } from '@kstackz/use-gesture';
import { Link } from '@tanstack/react-router';
import { appTheme } from '../../common/theme.ts';
import { Bar } from './bar/index.ts';
import { FEATURES } from './list.ts';

const featureAt = (slug: string) => FEATURES.find((f) => f.slug === slug);

/** Whether a Feature lives at this slug. */
export const hasFeature = (slug: string) => featureAt(slug) !== undefined;

/** The Features Showcase's own page: every Feature, as a card. */
export function FeatureList() {
  return (
    <div
      className="min-h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      style={{ viewTransitionName: 'showcase' }}
    >
      <appTheme.StatusBar />
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
        <h1 className="text-[15px] font-semibold tracking-tight">Features</h1>
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
    </div>
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
