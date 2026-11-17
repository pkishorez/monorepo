import { ArrowDownIcon } from 'lucide-react';
import { useHtmlCanvasSupport } from '@kestack/dune/react';
import { SOURCE } from './chrome.tsx';
import { CopyButton } from './code.tsx';
import { Demo } from './demo.tsx';
import { BUTTON, COLUMN } from './styles.ts';

/*
 * The first screen: what dune is and how to get it, beside a real app
 * drawn through it.
 */

const INSTALL = 'pnpm add @kestack/dune';

export function Hero() {
  return (
    <section
      aria-labelledby="title"
      className={`${COLUMN} grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14`}
    >
      <div className="flex flex-col gap-6">
        <p className="font-mono text-xs text-(--dn-text-3)">@kestack/dune</p>
        <h1
          id="title"
          className="text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-balance text-(--dn-text) sm:text-6xl"
        >
          Real HTML, lit by shaders
        </h1>
        <p className="max-w-[34rem] text-lg leading-7 text-pretty text-(--dn-text-2)">
          dune draws interactive HTML into a canvas and runs it through WebGL.
          Inputs still type, buttons still click and screen readers still read.
          Only the look is the shader’s.
        </p>

        <div className="flex h-12 max-w-[26rem] items-center gap-3 rounded-xl border border-(--dn-line) bg-(--dn-sunken) pr-2 pl-4 font-mono text-[13px]">
          <span aria-hidden className="text-(--dn-text-4) select-none">
            $
          </span>
          <code className="min-w-0 flex-1 truncate text-(--dn-text)">
            {INSTALL}
          </code>
          <CopyButton text={INSTALL} label="Copy the install command" />
        </div>

        <div className="flex flex-wrap gap-3">
          <a href="#api" className={BUTTON.solid}>
            See the API
            <ArrowDownIcon className="size-4" strokeWidth={2.25} />
          </a>
          <a
            href={SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            className={BUTTON.ghost}
          >
            Source on GitHub
          </a>
        </div>

        <Support />
      </div>

      <Demo />
    </section>
  );
}

/** Whether this browser can draw HTML into a canvas, said plainly. */
function Support() {
  const support = useHtmlCanvasSupport();
  if (support === 'pending') return <p className="h-5" />;
  const [dot, words] =
    support === 'current'
      ? ['bg-(--dn-live)', 'Your browser draws HTML into a canvas.']
      : support === 'legacy'
        ? [
            'bg-(--dn-live)',
            'Your browser draws HTML into a canvas, with the older, flagged API.',
          ]
        : [
            'bg-(--dn-warn-text)',
            'Your browser can’t draw HTML into a canvas yet, so the demo is plain HTML. Open it in Chrome 157 or later to see the light.',
          ];
  return (
    <p className="flex gap-2.5 text-[13px] leading-5 text-pretty text-(--dn-text-3)">
      <span
        aria-hidden
        className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`}
      />
      {words}
    </p>
  );
}
