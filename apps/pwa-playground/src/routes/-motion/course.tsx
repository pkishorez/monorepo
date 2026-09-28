import type { ReactNode } from 'react';
import { DragLessons } from './drag.tsx';
import { ScenarioLessons } from './scenarios.tsx';
import { SpringLessons } from './springs.tsx';
import { ValueLessons } from './values.tsx';

const WORDS: ReadonlyArray<readonly [string, string]> = [
  [
    'Motion value',
    'A box holding one number (x, scale, progress). Changing it moves things without re-rendering React.',
  ],
  [
    'Velocity',
    'How fast a value changes right now, with a direction. px per second.',
  ],
  [
    'Tween',
    'An animation on a schedule: from A to B in N seconds with an easing curve.',
  ],
  [
    'Spring',
    'An animation by physics: pulled toward the target, braked by damping. Keeps its speed when interrupted.',
  ],
  [
    'Stiffness · damping · mass',
    'The spring’s pull, brakes and weight. Their mix decides bounce.',
  ],
  [
    'Momentum / inertia',
    'Gliding on after release with the finger’s speed, slowed by friction.',
  ],
  [
    'Power · timeConstant',
    'Inertia’s two knobs: how far it glides, and how long it takes.',
  ],
  ['Bounds / constraints', 'Where a value is allowed to rest.'],
  [
    'Rubber band / elastic',
    'Giving way with growing resistance when dragged past a bound.',
  ],
  ['Bounce', 'The spring that catches a glide when it hits a bound.'],
  ['Snap / detent', 'Rest points a glide must land on.'],
  [
    'Flick',
    'A short, fast movement. Its speed, not its distance, carries the intent.',
  ],
  ['Commit / cancel', 'The two outcomes of a swipe on release.'],
  ['Catch', 'Stopping a running animation by touching it.'],
];

const PARTS = [
  {
    id: 'part-values',
    title: 'Values, not state',
    lessons: ['1 Motion value', '2 useTransform', '3 Velocity'],
  },
  {
    id: 'part-springs',
    title: 'Getting somewhere',
    lessons: ['4 Tween or spring', '5 Inside a spring', '6 Hand off velocity'],
  },
  {
    id: 'part-release',
    title: 'Letting go',
    lessons: [
      '7 Abrupt stop',
      '8 Momentum',
      '9 Bounds',
      '10 Snap points',
      '11 Swipe decisions',
      '12 Catching',
    ],
  },
  {
    id: 'part-scenarios',
    title: 'Real screens',
    lessons: ['13 Volume', '14 Image slider', '15 Map'],
  },
] as const;

function Part(props: {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly intro: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={props.id}
      aria-labelledby={`${props.id}-title`}
      className="flex scroll-mt-20 flex-col gap-6 pt-6"
    >
      <header className="flex max-w-[68ch] flex-col gap-2">
        <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          Part {props.number}
        </p>
        <h2
          id={`${props.id}-title`}
          className="text-3xl font-semibold tracking-tight text-balance"
        >
          {props.title}
        </h2>
        <p className="text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {props.intro}
        </p>
      </header>
      {props.children}
    </section>
  );
}

/**
 * Motion 101: Framer Motion's gesture vocabulary taught one idea at a time,
 * each with a live demo, knobs and its code, ending with real screens.
 */
export function MotionCourse() {
  return (
    <div className="flex flex-col gap-12">
      <nav
        aria-label="Course contents"
        className="grid gap-x-8 gap-y-4 rounded-xl bg-muted/40 p-5 ring-1 ring-foreground/5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {PARTS.map((part, i) => (
          <div key={part.id} className="flex flex-col gap-1">
            <a
              href={`#${part.id}`}
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {i + 1}. {part.title}
            </a>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {part.lessons.join(' · ')}
            </span>
          </div>
        ))}
      </nav>

      <section aria-labelledby="words-title" className="flex flex-col gap-3">
        <h2 id="words-title" className="text-sm font-medium">
          The words, in one line each
        </h2>
        <dl className="grid gap-px overflow-hidden rounded-lg bg-border ring-1 ring-foreground/10 sm:grid-cols-2">
          {WORDS.map(([word, meaning]) => (
            <div
              key={word}
              className="flex flex-col gap-0.5 bg-card px-3 py-2.5"
            >
              <dt className="font-mono text-xs">{word}</dt>
              <dd className="text-sm text-pretty text-muted-foreground">
                {meaning}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Part
        id="part-values"
        number={1}
        title="Values, not state"
        intro="Before anything moves, three ideas: numbers live in motion values, one number can drive many things, and every number has a speed."
      >
        <ValueLessons />
      </Part>

      <Part
        id="part-springs"
        number={2}
        title="Getting somewhere"
        intro="How a value travels to a target by itself: on a schedule or by physics, and why the finger’s speed must come along."
      >
        <SpringLessons />
      </Part>

      <Part
        id="part-release"
        number={3}
        title="Letting go"
        intro="What happens between the finger lifting and the thing coming to rest. This is where gestures feel real or fake."
      >
        <DragLessons />
      </Part>

      <Part
        id="part-scenarios"
        number={4}
        title="Real screens"
        intro="Everything so far, combined. Each screen picks different answers to the same questions: momentum or not, which edge, decide or glide."
      >
        <ScenarioLessons />
      </Part>
    </div>
  );
}
