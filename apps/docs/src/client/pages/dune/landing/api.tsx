import type { ReactNode } from 'react';
import { Code } from './code.tsx';
import Engine from './engine.mdx';
import LitPage from './lit-page.mdx';
import OwnEffect from './own-effect.mdx';
import { COLUMN, EYEBROW } from './styles.ts';

/*
 * The API: three examples, each beside what to notice in it, and then
 * every export of both entry points with what it does.
 */

export function Api() {
  return (
    <section
      id="api"
      aria-labelledby="api-title"
      className="scroll-mt-14 border-t border-(--dn-line)"
    >
      <div className={`${COLUMN} py-20`}>
        <p className={EYEBROW}>API</p>
        <h2
          id="api-title"
          className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance text-(--dn-text) sm:text-4xl"
        >
          Two entry points, one idea
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-pretty text-(--dn-text-3)">
          <Mono>@kestack/dune</Mono> is plain TypeScript and WebGL2: Effects and
          the Engine that runs them. <Mono>@kestack/dune/react</Mono> wraps it
          in two components.
        </p>

        <div className="mt-14 flex flex-col gap-16">
          <Example
            title="Light a page"
            name="deploy.tsx"
            code={LitPage}
            points={[
              <>
                <Mono>{'<HtmlCanvas>'}</Mono> draws its children through the
                Effects you give it. They stay in the DOM: the input types and
                the button clicks.
              </>,
              <>
                <Mono>{'<Lamp>'}</Mono> makes what it wraps a light source: it
                lights what is around it and keeps its own colour.
              </>,
              <>
                Where the browser can’t draw HTML into a canvas, the children
                are drawn as plain HTML.
              </>,
            ]}
          />
          <Example
            title="Write an Effect"
            name="ripple.ts"
            code={OwnEffect}
            points={[
              <>
                An Effect is one GLSL function,{' '}
                <Mono>vec4 effect(vec2 uv)</Mono>, with typed Params:{' '}
                <Mono>num</Mono> and <Mono>color</Mono>.
              </>,
              <>
                <Mono>source</Mono>, <Mono>u_pointer</Mono> and{' '}
                <Mono>u_time</Mono> come with every Effect. One that reads time
                draws every frame; the rest draw only on change.
              </>,
              <>Effects run in order, each over the one before.</>,
            ]}
          />
          <Example
            title="Without React"
            name="canvas.ts"
            code={Engine}
            points={[
              <>
                <Mono>detect</Mono> says which HTML-in-Canvas API the browser
                has: <Mono>current</Mono>, <Mono>legacy</Mono> or{' '}
                <Mono>none</Mono>.
              </>,
              <>
                One <Mono>Engine</Mono> per canvas copies the HTML in whenever
                the browser paints it, and runs the Effects over it.
              </>,
              <>
                <Mono>{'<HtmlCanvas>'}</Mono> is this, made and disposed with
                the component.
              </>,
            ]}
          />
        </div>

        <div className="mt-20 grid gap-6 lg:grid-cols-2">
          <Exports entry="@kestack/dune" rows={CORE} />
          <Exports entry="@kestack/dune/react" rows={REACT} />
        </div>
      </div>
    </section>
  );
}

function Example({
  title,
  name,
  code,
  points,
}: {
  readonly title: string;
  readonly name: string;
  readonly code: Parameters<typeof Code>[0]['code'];
  readonly points: ReadonlyArray<ReactNode>;
}) {
  return (
    <article className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-12">
      <div className="lg:sticky lg:top-24">
        <h3 className="text-xl font-semibold tracking-tight text-(--dn-text)">
          {title}
        </h3>
        <ul className="mt-4 flex flex-col gap-3">
          {points.map((point, index) => (
            <li
              key={index}
              className="flex gap-3 text-sm leading-6 text-pretty text-(--dn-text-3)"
            >
              <span
                aria-hidden
                className="mt-2.5 h-px w-3 shrink-0 bg-(--dn-accent)"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
      <Code name={name} code={code} />
    </article>
  );
}

type Row = { readonly name: string; readonly does: string };

const CORE: ReadonlyArray<Row> = [
  {
    name: 'defineEffect',
    does: 'Defines an Effect from GLSL and Params; call it with values to use it.',
  },
  { name: 'num', does: 'A number Param: its default, range and step.' },
  { name: 'color', does: 'A colour Param, written as #rrggbb.' },
  {
    name: 'lighting',
    does: 'A light that follows the pointer, with shadows, a sheen on edges, ambient light and Lamps.',
  },
  {
    name: 'Engine',
    does: 'Draws one canvas’s HTML through its Effects, only when something changed.',
  },
  {
    name: 'detect',
    does: 'Which HTML-in-Canvas API the browser has: current, legacy or none.',
  },
  {
    name: 'canvasAttributes',
    does: 'The attributes a canvas needs to draw its child, under either API.',
  },
  {
    name: 'drawableAttributes',
    does: 'The attribute the canvas’s child needs under the current API.',
  },
  {
    name: 'ShaderError',
    does: 'Thrown when an Effect’s GLSL fails to compile, with the log and numbered source.',
  },
];

const REACT: ReadonlyArray<Row> = [
  {
    name: 'HtmlCanvas',
    does: 'Draws its children into a canvas through the given Effects; plain HTML where it can’t.',
  },
  {
    name: 'Lamp',
    does: 'A box that gives off light in its colour inside an <HtmlCanvas>.',
  },
  {
    name: 'useLamp',
    does: 'Makes any element a Lamp: put the returned ref on it.',
  },
  {
    name: 'useHtmlCanvasSupport',
    does: 'The browser’s HTML-in-Canvas API, or pending while rendering on the server.',
  },
];

function Exports({
  entry,
  rows,
}: {
  readonly entry: string;
  readonly rows: ReadonlyArray<Row>;
}) {
  return (
    <section
      aria-label={entry}
      className="self-start overflow-hidden rounded-2xl border border-(--dn-line) bg-(--dn-panel)"
    >
      <h3 className="border-b border-(--dn-line) px-5 py-4 font-mono text-[13px] text-(--dn-text)">
        {entry}
      </h3>
      <dl className="divide-y divide-(--dn-line)">
        {rows.map((row) => (
          <div
            key={row.name}
            className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="font-mono text-[13px] text-(--dn-accent-text)">
              {row.name}
            </dt>
            <dd className="text-[13px] leading-5 text-pretty text-(--dn-text-3)">
              {row.does}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Mono({ children }: { readonly children: ReactNode }) {
  return (
    <code className="rounded-md bg-(--dn-raised) px-1.5 py-0.5 font-mono text-[0.85em] text-(--dn-text-2)">
      {children}
    </code>
  );
}
