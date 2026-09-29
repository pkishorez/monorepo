import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRightIcon, ArrowUpRightIcon } from '@kstackz/ui-toolkit/lucide';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { useDisplayMode } from '@kstackz/pwa-toolkit/extras';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import type { ReactNode } from 'react';
import { Key } from '../components/index.ts';
import { buildPreset, pwaEnabled, updateMode } from '../lib/build.ts';
import { chapters } from '../lib/chapters.ts';
import { useWorkers } from '../lib/workers.ts';
import { useTouch } from '../shell/index.ts';

export const Route = createFileRoute('/')({ component: Home });

const README_URL =
  'https://github.com/pkishorez/monorepo/tree/main/toolkits/pwa-toolkit';

/** A live line under a promise: whether this very tab keeps it right now. */
function Fact(props: {
  readonly on: boolean;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <p
      data-testid={props.testId}
      data-on={props.on}
      className="flex items-baseline gap-2.5 text-sm text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={
          props.on
            ? 'size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-positive'
            : 'size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-muted-foreground/50'
        }
      />
      {props.children}
    </p>
  );
}

function InstallFact() {
  const mode = useDisplayMode();
  return (
    <Fact on={mode !== 'browser'} testId="fact-install">
      {mode === 'browser'
        ? 'You are reading this in a browser tab.'
        : `You installed it: this window runs ${mode}.`}
    </Fact>
  );
}

function OfflineFact() {
  const workers = useWorkers();
  const on = workers !== null && workers.controller !== 'none';
  return (
    <Fact on={on} testId="fact-offline">
      {workers === null
        ? 'Checking for a worker…'
        : on
          ? 'Its worker controls this tab, so this page would open offline.'
          : 'No worker controls this tab yet; reload once to hand it over.'}
    </Fact>
  );
}

function UpdatesFact() {
  const pwa = usePwa();
  const ready = pwa.status._tag === 'UpdateReady';
  return (
    <Fact on={ready} testId="fact-updates">
      {ready
        ? 'A new version is waiting for you to accept it.'
        : pwa.version.buildId === null
          ? 'No build ID here: a dev server has no builds to update between.'
          : `Build ${pwa.version.buildId.slice(0, 8)}, the newest there is.`}
    </Fact>
  );
}

function GesturesFact() {
  const touch = useTouch();
  return (
    <Fact on={touch} testId="fact-gestures">
      {touch
        ? 'Try it now: swipe in from the left edge to open the menu.'
        : 'Open this on a phone to swipe. Here, the arrow keys turn pages.'}
    </Fact>
  );
}

const PROMISES: ReadonlyArray<{
  readonly chapter: string;
  readonly body: string;
  readonly fact: ReactNode;
}> = [
  {
    chapter: 'install',
    body: 'A manifest names the app and draws its icon, and the browser offers to put it on the home screen. From there it opens in a window of its own, with no address bar, like anything from a store.',
    fact: <InstallFact />,
  },
  {
    chapter: 'offline',
    body: 'Its pages and files are saved on the device on the first visit. Turn the network off and it still opens, and the data you already saw is still there.',
    fact: <OfflineFact />,
  },
  {
    chapter: 'updates',
    body: 'A new version downloads in the background and waits. It never swaps itself in under you: it asks, then every open window moves to it at once.',
    fact: <UpdatesFact />,
  },
  {
    chapter: 'gestures',
    body: 'Swipes, drawers and pulls belong to the app, not the browser. They follow the finger, keep its speed when you let go, and never fight the page’s own scrolling.',
    fact: <GesturesFact />,
  },
];

function Promises() {
  return (
    <ol className="flex flex-col">
      {PROMISES.map((promise, i) => {
        const chapter = chapters.find((c) => c.id === promise.chapter);
        const first = chapter?.pages[0];
        if (chapter === undefined || first === undefined) return null;
        return (
          <li
            key={chapter.id}
            className="grid gap-x-6 gap-y-3 border-t border-border py-8 sm:grid-cols-[3.5rem_minmax(0,1fr)]"
          >
            <span
              aria-hidden="true"
              className="font-display text-3xl leading-none text-muted-foreground/70 tabular-nums"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex max-w-[60ch] flex-col gap-3">
              <h3 className="font-display text-2xl leading-snug font-medium text-balance sm:text-[1.75rem]">
                {chapter.promise}
              </h3>
              <p className="text-[17px] leading-relaxed text-pretty text-muted-foreground">
                {promise.body}
              </p>
              {promise.fact}
              <Link
                to={first.path}
                data-testid={`home-${chapter.id}`}
                className="group inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium underline decoration-foreground/20 underline-offset-4 transition-colors duration-150 hover:decoration-foreground/70"
              >
                {chapter.pages.length === 1
                  ? `Play with ${first.title.toLowerCase()}`
                  : `${chapter.pages.length} playgrounds, from ${first.title.toLowerCase()}`}
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Page, worker, and the two places an answer can come from. */
function WorkerDiagram() {
  const box =
    'flex flex-col items-center justify-center gap-0.5 rounded-lg bg-card px-3 py-2.5 text-center ring-1 ring-foreground/10';
  const arrow = (
    <span aria-hidden="true" className="text-muted-foreground">
      ⇄
    </span>
  );
  return (
    <figure className="flex flex-col gap-3 self-start rounded-xl bg-muted/40 p-4 sm:p-5">
      <div
        aria-hidden="true"
        className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-sm sm:gap-3"
      >
        <div className={box}>
          <span className="font-medium">Page</span>
          <span className="text-xs text-muted-foreground">asks</span>
        </div>
        {arrow}
        <div className={`${box} ring-2 ring-foreground`}>
          <span className="font-medium">Worker</span>
          <span className="text-xs text-muted-foreground">decides</span>
        </div>
        {arrow}
        <div className="flex flex-col gap-2">
          <div className={box}>
            <span className="font-medium">Cache</span>
          </div>
          <div className={box}>
            <span className="font-medium">Network</span>
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        The page asks; the worker answers from its cache, the network, or both.
      </figcaption>
    </figure>
  );
}

const WAYS: ReadonlyArray<readonly [ReactNode, string]> = [
  ['Swipe in from the left edge', 'Open the menu'],
  ['Swipe left or right', 'Next or previous page'],
  ['Pull down at the top', 'Refresh the page'],
  [
    <>
      <Key>←</Key> <Key>→</Key> on a keyboard
    </>,
    'Next or previous page',
  ],
];

function Home() {
  return (
    <main
      data-testid="scenario-home"
      data-page
      className="flex min-w-0 flex-col gap-16 pt-10 pb-16 lg:pt-16"
    >
      <header className="flex flex-col gap-6">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          A field guide that runs live
        </p>
        <h1 className="max-w-[17ch] font-display text-5xl leading-[1.04] font-medium tracking-[-0.015em] text-balance sm:text-6xl">
          A website that behaves like an app.
        </h1>
        <div className="flex max-w-[58ch] flex-col gap-4 text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl sm:leading-relaxed">
          <p>
            A{' '}
            <strong className="font-medium text-foreground">
              progressive web app
            </strong>{' '}
            is an ordinary website that has learned four more things. It
            installs to your home screen, opens without a network, updates
            itself politely, and answers to your fingers like something native.
            No app store stands in between.
          </p>
          <p>
            This playground is one. Every page runs the real thing, built with
            pwa-toolkit and use-gesture, so you can break it and watch it
            recover.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            to="/install"
            className={buttonVariants({
              size: 'lg',
              className: 'min-h-11 px-4 sm:min-h-10',
            })}
            data-testid="home-start"
          >
            Start with installing
            <ArrowRightIcon aria-hidden="true" />
          </Link>
          <a
            href={README_URL}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline decoration-foreground/20 underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground/60 sm:min-h-10"
          >
            pwa-toolkit README
            <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </header>

      <section aria-labelledby="promises" className="flex flex-col gap-2">
        <h2 id="promises" className="text-sm font-semibold">
          Four promises
        </h2>
        <Promises />
      </section>

      <section
        aria-labelledby="worker"
        className="grid gap-6 border-t border-border pt-8 md:grid-cols-2 md:gap-10"
      >
        <div className="flex flex-col gap-3">
          <h2
            id="worker"
            className="font-display text-2xl font-medium sm:text-[1.75rem]"
          >
            The part you don’t see
          </h2>
          <p className="text-[17px] leading-relaxed text-pretty text-muted-foreground">
            All four rest on a service worker: a small script the browser keeps
            beside the page. Every request the page makes goes through it first,
            and it decides whether to answer from what it saved or to ask the
            network.
          </p>
          <Link
            to="/status"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/70"
          >
            Inspect this app’s worker
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        <WorkerDiagram />
      </section>

      <section
        aria-labelledby="getting-around"
        className="flex flex-col gap-4 border-t border-border pt-8"
      >
        <h2
          id="getting-around"
          className="font-display text-2xl font-medium sm:text-[1.75rem]"
        >
          Getting around
        </h2>
        <p className="max-w-[60ch] text-[17px] leading-relaxed text-pretty text-muted-foreground">
          The app is its own first gesture demo. On a touch screen these work on
          every page; demo stages keep their touches to themselves.
        </p>
        <dl className="grid max-w-xl gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10">
          {WAYS.map(([how, what], i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-4 bg-card px-4 py-3 text-sm"
            >
              <dt>{how}</dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="this-build"
        className="flex flex-col gap-4 border-t border-border pt-8"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="this-build" className="text-sm font-semibold">
            This build
          </h2>
          <p className="max-w-[60ch] text-sm leading-relaxed text-pretty text-muted-foreground">
            Chosen at deploy time by environment variables. Each deploy has a
            new Build ID, so open tabs get the update prompt.
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
