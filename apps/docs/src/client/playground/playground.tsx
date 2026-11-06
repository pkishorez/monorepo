import { useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftIcon } from 'lucide-react';
import { useHtmlCanvasSupport } from '@kestack/dune/react';
import { THEME } from './kit/index.ts';
import { SCENES } from './scenes/index.ts';

/*
 * The playground: scenes down the side, the one the URL's hash names on
 * the stage. Each scene is real React drawn into a canvas and run through
 * shaders by @kestack/dune.
 */

const onHash = (change: () => void) => {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
};

export function Playground() {
  const hash = useSyncExternalStore(
    onHash,
    () => window.location.hash.slice(1),
    () => '',
  );
  const current = SCENES.find((scene) => scene.id === hash) ?? SCENES[0]!;
  const { Scene } = current;
  return (
    <div
      style={THEME}
      className="dark flex min-h-dvh flex-col gap-2 bg-(--pg-page) p-2 text-(--pg-text-2) antialiased lg:h-dvh lg:flex-row"
    >
      <nav
        aria-label="Playground"
        className="flex shrink-0 flex-col gap-6 rounded-2xl border border-(--pg-line) bg-(--pg-panel) p-3 lg:w-64"
      >
        <header className="px-2 pt-2">
          <a
            href="/"
            className="-ml-1 inline-flex h-7 items-center gap-1.5 rounded-md px-1 text-xs text-(--pg-text-3) transition-colors duration-150 hover:text-(--pg-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus)"
          >
            <ArrowLeftIcon className="size-3.5" strokeWidth={2} />
            ke stack
          </a>
          <h1 className="mt-3 text-lg font-semibold tracking-tight text-(--pg-text)">
            Playground
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-pretty text-(--pg-text-3)">
            Real HTML drawn into a canvas and lit by shaders. Everything stays
            clickable.
          </p>
        </header>

        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {SCENES.map((scene) => {
            const active = scene.id === current.id;
            const Icon = scene.icon;
            return (
              <li key={scene.id} className="shrink-0">
                <a
                  href={`#${scene.id}`}
                  aria-current={active ? 'page' : undefined}
                  className="group relative flex items-center gap-3 rounded-xl p-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--pg-focus)"
                >
                  {active && (
                    <motion.span
                      layoutId="playground-scene"
                      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute inset-0 rounded-xl bg-(--pg-raised)"
                    />
                  )}
                  <span
                    className={`relative grid size-8 shrink-0 place-items-center rounded-lg border transition-colors duration-150 ${active ? 'border-transparent bg-(--pg-accent) text-(--pg-accent-ink)' : 'border-(--pg-line) text-(--pg-text-3) group-hover:text-(--pg-text-2)'}`}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="relative min-w-0">
                    <span
                      className={`block text-[13px] font-medium transition-colors duration-150 ${active ? 'text-(--pg-text)' : 'text-(--pg-text-2) group-hover:text-(--pg-text)'}`}
                    >
                      {scene.title}
                    </span>
                    <span className="hidden truncate text-xs text-(--pg-text-3) lg:block">
                      {scene.tagline}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        <Support />
      </nav>
      <Scene key={current.id} />
    </div>
  );
}

/** Whether this browser draws the HTML into a canvas, at the foot of the nav. */
function Support() {
  const support = useHtmlCanvasSupport();
  if (support === 'pending') return null;
  const [dot, text] =
    support === 'current'
      ? ['bg-(--pg-live)', 'HTML-in-Canvas is on']
      : support === 'legacy'
        ? ['bg-(--pg-warn-text)', 'HTML-in-Canvas, older API']
        : ['bg-(--pg-text-4)', 'No HTML-in-Canvas: plain HTML'];
  return (
    <p className="mt-auto hidden items-center gap-2 px-2 pb-1 text-xs text-(--pg-text-3) lg:flex">
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {text}
    </p>
  );
}
