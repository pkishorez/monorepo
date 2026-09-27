import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon, ArrowUpRightIcon } from 'kui-toolkit/lucide';
import { buttonVariants } from 'kui-toolkit/components/ui/button';
import { StatusStrip } from '../components/index.ts';
import { buildPreset, pwaEnabled, updateMode } from '../lib/build.ts';
import {
  SCENARIO_GROUPS,
  type ScenarioGroup,
  scenarios,
} from '../lib/scenarios.ts';

export const Route = createFileRoute('/')({ component: Home });

const GROUP_BLURB: Record<ScenarioGroup, string> = {
  Install:
    'The manifest, icons and worker make the app installable, and the first visit is controlled without a reload.',
  'Offline & caching':
    'Pull the network. The App Shell boots, each Runtime Cache strategy answers its own way, and unknown pages fall back cleanly.',
  Updates:
    'A new Build ID waits for consent, then every open tab reloads into it exactly once.',
  'Worker RPC':
    'Effect RPC into the service worker: unary calls, streams that restart, and Version Skew caught in the act.',
  Safety:
    'What the worker must never cache, and what signing out wipes from the device.',
  Gestures:
    'kui’s gesture engine in a scrolling page: one- and two-finger swipes, pinch, holds and chords, with the edges left to the browser and OS.',
};

const README_URL =
  'https://github.com/pkishorez/monorepo/tree/main/toolkits/pwa-toolkit';

function Home() {
  return (
    <main
      data-testid="scenario-home"
      data-page
      className="flex min-w-0 flex-col gap-12 pt-8 pb-16 lg:pt-10"
    >
      <header className="flex max-w-[62ch] flex-col gap-4">
        <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          pwa-toolkit, running on this deploy
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl sm:leading-[1.05]">
          PWA Playground
        </h1>
        <p className="text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          pwa-toolkit turns a TanStack Start app into an installable,
          offline-capable PWA: a service worker written in Effect, a Precache
          per build, Runtime Cache rules, an update flow that asks first, and
          RPC into the worker. This app is built with it. Every page below runs
          one part live, so you can break it and watch it recover.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1">
          <Link
            to="/install"
            className={buttonVariants({
              size: 'lg',
              className: 'min-h-11 px-4 touch-manipulation sm:min-h-10',
            })}
            data-testid="home-start"
          >
            Start with Install
            <ArrowRightIcon aria-hidden="true" />
          </Link>
          <a
            href={README_URL}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline decoration-foreground/20 underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground/60 sm:min-h-10"
          >
            Toolkit README
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </header>

      <StatusStrip />

      <section aria-labelledby="scenarios-heading" className="flex flex-col">
        <h2
          id="scenarios-heading"
          className="mb-2 text-sm font-medium text-muted-foreground"
        >
          Scenarios
        </h2>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {SCENARIO_GROUPS.map((group) => (
            <div
              key={group}
              className="grid gap-3 py-6 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8"
            >
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold tracking-tight">
                  {group}
                </h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {GROUP_BLURB[group]}
                </p>
              </div>
              <ul className="flex flex-col gap-1">
                {scenarios
                  .filter((s) => s.group === group)
                  .map((scenario) => (
                    <li key={scenario.path}>
                      <Link
                        to={scenario.path}
                        data-testid={`link-${scenario.path.slice(1)}`}
                        className="group -mx-3 flex min-h-14 items-center gap-4 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="font-medium">{scenario.title}</span>
                          <span className="text-sm text-muted-foreground">
                            {scenario.summary}
                          </span>
                        </span>
                        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                          {scenario.path}
                        </span>
                        <ArrowRightIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                        />
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="switches-heading"
        className="grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8"
      >
        <div className="flex flex-col gap-1.5">
          <h2
            id="switches-heading"
            className="text-base font-semibold tracking-tight"
          >
            This build
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            Chosen at deploy time by environment variables. Each deploy has a
            new Build ID, so open tabs get the Update Prompt.
          </p>
        </div>
        <dl className="grid gap-px self-start overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 sm:grid-cols-3">
          {[
            ['Preset', 'PWA_PRESET', buildPreset, 'home-preset'],
            ['Update mode', 'PWA_UPDATE_MODE', updateMode, 'home-update-mode'],
            [
              'Worker',
              'PWA_ENABLED',
              pwaEnabled ? 'enabled' : 'Kill Switch',
              'home-enabled',
            ],
          ].map(([label, env, value, testId]) => (
            <div key={env} className="flex flex-col gap-1 bg-card px-4 py-3.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd
                className="font-mono text-sm font-medium"
                data-testid={testId}
              >
                {value}
              </dd>
              <dd className="font-mono text-[11px] text-muted-foreground">
                {env}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
