import { LayersIcon, MousePointerClickIcon, SparklesIcon } from 'lucide-react';
import { COLUMN, EYEBROW } from './styles.ts';

/*
 * How it works, in the three steps every frame takes: the browser paints
 * the HTML for the canvas, dune runs the Effects over that picture, and
 * the browser is told where the HTML ended up so it stays real.
 */

const STEPS = [
  {
    icon: LayersIcon,
    title: 'The browser paints your HTML',
    body: 'With Chromium’s HTML-in-Canvas API, the HTML inside a <canvas> is laid out and painted as usual, then handed over as a picture instead of shown.',
  },
  {
    icon: SparklesIcon,
    title: 'Effects run over the picture',
    body: 'Each Effect is one GLSL function with typed Params, run in order on the GPU. dune draws only when the HTML, the pointer or a Lamp changes, so a still page costs nothing.',
  },
  {
    icon: MousePointerClickIcon,
    title: 'The HTML stays real',
    body: 'dune tells the browser where the HTML is drawn, so clicks, focus, typing, selection and screen readers reach the real elements. Where the API is missing, it is plain HTML.',
  },
] as const;

export function How() {
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="scroll-mt-14 border-t border-(--dn-line)"
    >
      <div className={`${COLUMN} py-20`}>
        <p className={EYEBROW}>How it works</p>
        <h2
          id="how-title"
          className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-(--dn-text) sm:text-4xl"
        >
          A page to the user, a texture to the GPU
        </h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-4 rounded-2xl border border-(--dn-line) bg-(--dn-panel) p-6"
            >
              <span className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-(--dn-raised) text-(--dn-accent-text)">
                  <step.icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="font-mono text-xs text-(--dn-text-4) tabular-nums">
                  0{index + 1}
                </span>
              </span>
              <h3 className="text-base font-semibold tracking-tight text-(--dn-text)">
                {step.title}
              </h3>
              <p className="text-sm leading-6 text-pretty text-(--dn-text-3)">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
