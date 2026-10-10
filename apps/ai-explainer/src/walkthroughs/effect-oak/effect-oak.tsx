import type { ReactNode } from 'react';
import { TitleCard } from '../../foundation/cards/index.ts';
import { DrawnPath, ease, fps, glide } from '../../foundation/canvas/index.ts';
import { blockOf, CodeCard } from '../../foundation/code/index.ts';
import type { Cue } from '../../foundation/explainer/index.ts';
import { Footage } from '../../foundation/footage/index.ts';
import { swellSeconds } from '../../foundation/sound/index.ts';
import { hue, useStyle } from '../../foundation/style/index.ts';
import {
  defineWalkthrough,
  type DrawingProps,
  type Move,
} from '../../foundation/walkthrough/index.ts';
import {
  Lifetimes,
  PlateTitle,
  plateWidth,
  Rendering,
  Replay,
} from './diagrams.tsx';
import { layout, Place, Region, type Point } from './region.tsx';
import { missingWeather, sources } from './sources.ts';
import { voiceover } from './voiceover.ts';

// The Rockets demo, built up chapter by chapter on one board. Chapters snake
// across two rows so each camera move is short; Going deeper runs along the
// bottom, and the close pulls back to show the whole build-up.

const at = {
  actor: { x: 0, y: 0 },
  states: { x: 2600, y: 0 },
  many: { x: 5200, y: 0 },
  capabilities: { x: 5200, y: 1400 },
  motion: { x: 2600, y: 1400 },
  time: { x: 0, y: 1400 },
};
const deeper = { y: 2950, title: { x: -575, y: 2380 } };
const plates = {
  lifetimes: { x: 0, y: deeper.y },
  commands: { x: 1300, y: deeper.y },
  rendering: { x: 2600, y: deeper.y },
  replay: { x: 3900, y: deeper.y },
  inspector: { x: 5200, y: deeper.y },
};
const whole = { x: 2600, y: 1545, scale: 0.237 };

// The Launch Site as it would be without Providing Weather.
const withoutWeather = (() => {
  const code = sources.capabilitiesLaunchSite;
  const lines = code.split('\n');
  const [listed] = blockOf(code, 'provides: [Weather]');
  const [from, to] = blockOf(code, 'provides: (self)');
  return lines
    .filter((_, i) => i + 1 !== listed && (i + 1 < from || i + 1 > to))
    .join('\n');
})();

// Camera shots of a chapter: all of it, its code, or its clip.
const overview = (p: Point, when: number): Move => ({
  at: when,
  x: p.x,
  y: p.y - 90,
  scale: 0.78,
});
const onCode = (p: Point, when: number): Move => ({
  at: when,
  x: p.x + layout.code.x + layout.code.width / 2 + 60,
  y: p.y + 40,
  scale: 1.06,
});
const onClip = (p: Point, when: number): Move => ({
  at: when,
  x: p.x + layout.clip.x + layout.clip.width / 2,
  y: p.y + layout.clip.y + (layout.clip.width * 9) / 32,
  scale: 1.5,
  punch: true,
});
const onPlate = (p: Point, when: number, dy = 0): Move => ({
  at: when,
  x: p.x,
  y: p.y + dy,
  scale: 1.3,
});

const lead = 0.3;

function path(cue: Cue): Move[] {
  const c = (id: string, word?: string, delay = 0) =>
    cue(id, word, delay - lead);
  return [
    { ...overview(at.actor, 0), seconds: 0.01 },
    { ...onCode(at.actor, c('actor-model', 'An Actor holds')), seconds: 1.2 },
    onClip(at.actor, c('actor-view', 'and sends')),

    {
      ...overview(at.states, cue('states-accept', undefined, -1)),
      seconds: 1.3,
    },
    onCode(at.states, c('states-accept', 'So an Actor')),
    overview(at.states, c('states-lifetime', 'In flight')),
    onClip(at.states, c('states-lifetime', 'Land,')),

    { ...overview(at.many, cue('many-list', undefined, -1)), seconds: 1.3 },
    onCode(at.many, c('many-list', 'The Launch Site')),
    onClip(at.many, c('many-children', 'They fire')),

    {
      ...overview(at.capabilities, cue('capabilities-requires', undefined, -1)),
      seconds: 1.3,
    },
    onCode(at.capabilities, c('capabilities-requires', 'The Launch Site')),
    onClip(at.capabilities, c('capabilities-command', 'Storm?')),

    { ...overview(at.motion, cue('motion', undefined, -1)), seconds: 1.3 },
    onClip(at.motion, c('motion', 'Motion glides')),

    { ...overview(at.time, cue('time-log', undefined, -1.2)), seconds: 1.4 },
    {
      at: c('time-log', 'every Message'),
      x: at.time.x,
      y: at.time.y + 150,
      scale: 1.12,
    },
    {
      at: c('time-branch', 'Both histories'),
      x: at.time.x,
      y: at.time.y + 50,
      scale: 0.86,
    },

    // The section card hides this jump.
    {
      ...onPlate(plates.lifetimes, cue('deeper-lifetimes', undefined, -1.4)),
      seconds: 0.05,
      quiet: true,
    },
    onPlate(plates.commands, c('deeper-commands'), 120),
    onPlate(plates.rendering, c('deeper-rendering')),
    onPlate(plates.replay, c('deeper-replay')),
    onPlate(plates.inspector, c('deeper-inspector')),

    { at: cue('close', undefined, -0.9), ...whole, seconds: 1.8 },
  ];
}

function sounds(cue: Cue) {
  return [
    { name: 'swell' as const, at: cue('time-log') - swellSeconds * fps },
    { name: 'chime' as const, at: cue('close', undefined, 1.6) },
  ];
}

const pauses = {
  'actor-model': 2.6,
  'actor-view': 0.4,
  'states-accept': 2.4,
  'states-lifetime': 0.6,
  'many-list': 1.6,
  'many-children': 0.5,
  'capabilities-requires': 1.6,
  'capabilities-command': 0.6,
  motion: 1.6,
  'time-log': 2,
  'time-branch': 0.8,
  'deeper-lifetimes': 3,
  'deeper-commands': 0.6,
  'deeper-rendering': 0.6,
  'deeper-replay': 0.6,
  'deeper-inspector': 0.6,
  close: 1.6,
};

function Drawing({ frame, cue, look }: DrawingProps) {
  const style = useStyle();
  const start = (id: string) => cue(id, undefined, -1);
  const s = sources;
  const steps = (code: string, ...stops: [number, string, string?][]) =>
    stops.map(([when, start, within]) => ({
      at: when - lead * fps,
      lines: blockOf(code, start, within),
    }));

  const chain: [Point, Point, number][] = [
    [at.actor, at.states, start('states-accept')],
    [at.states, at.many, start('many-list')],
    [at.many, at.capabilities, start('capabilities-requires')],
    [at.capabilities, at.motion, start('motion')],
    [at.motion, at.time, start('time-log')],
  ];

  return (
    <>
      <div style={{ color: hue(style, 0), opacity: 0.5 }}>
        {chain.map(([a, b, when], i) => {
          const across = a.y === b.y;
          const d = across
            ? `M ${a.x + 1140} ${a.y} L ${b.x - 1140} ${b.y}`
            : `M ${a.x - 80} ${a.y + 420} L ${b.x - 80} ${b.y - 650}`;
          return (
            <DrawnPath
              key={i}
              d={d}
              progress={ease(frame, when - 0.8 * fps, 1.2, glide)}
              dashed
              width={8}
            />
          );
        })}
      </div>

      <Region
        at={at.actor}
        chapter={1}
        title="An Actor"
        enter={0}
        frame={frame}
        look={look}
        cards={[
          {
            at: 0,
            title: 'actor/rocket.ts',
            code: s.actorRocket,
            steps: steps(
              s.actorRocket,
              [cue('actor-model', 'An Actor holds'), 'model:'],
              [cue('actor-model', 'It accepts'), 'message:'],
              [cue('actor-model', 'And an update'), 'update:'],
            ),
          },
          {
            at: cue('actor-view', undefined, -lead),
            title: 'actor/view.tsx',
            code: s.actorView,
            lang: 'tsx',
            steps: steps(
              s.actorView,
              [cue('actor-view', 'it takes'), 'gauge='],
              [cue('actor-view', 'sends'), '<Button onClick'],
            ),
          },
        ]}
        clips={[
          {
            id: 'c1-actor',
            from: cue('actor-view', 'It'),
            until: start('states-accept'),
          },
        ]}
      />

      <Region
        at={at.states}
        chapter={2}
        title="States"
        enter={start('states-accept')}
        frame={frame}
        look={look}
        cards={[
          {
            at: start('states-accept'),
            title: 'states/rocket.ts',
            code: s.statesRocket,
            steps: steps(
              s.statesRocket,
              [cue('states-accept', 'So an Actor'), 'state:'],
              [cue('states-accept', 'each State'), 'OnPad: {', 'update:'],
              [
                cue('states-accept', 'which Messages'),
                'InFlight: {',
                'update:',
              ],
              [cue('states-lifetime', 'In flight'), 'lifetime:'],
            ),
          },
        ]}
        clips={[
          {
            id: 'c2-states',
            from: cue('states-accept', 'each State'),
            until: cue('states-lifetime', 'Run dry'),
          },
          {
            id: 'c2-lost',
            at: cue('states-lifetime', 'Run dry', -lead),
            from: cue('states-lifetime', 'Run dry', -lead),
            until: start('many-list'),
          },
        ]}
      />

      <Region
        at={at.many}
        chapter={3}
        title="More Actors"
        enter={start('many-list')}
        frame={frame}
        look={look}
        cards={[
          {
            at: start('many-list'),
            title: 'more-actors/launch-site.ts',
            code: s.moreActorsLaunchSite,
            steps: steps(
              s.moreActorsLaunchSite,
              [cue('many-list', 'keeps a list'), 'model:'],
              [cue('many-list', 'and Actor.many'), 'children:'],
            ),
          },
          {
            at: cue('many-children', undefined, -lead),
            title: 'more-actors/rocket.ts',
            code: s.moreActorsRocket,
            steps: steps(
              s.moreActorsRocket,
              [cue('many-children', 'States decide'), 'children:'],
              [cue('many-children', 'Only a rocket'), 'invoke:'],
            ),
          },
        ]}
        clips={[
          {
            id: 'c3-many',
            from: cue('many-list', 'and Actor.many'),
            until: start('capabilities-requires'),
          },
        ]}
      />

      <Region
        at={at.capabilities}
        chapter={4}
        title="Capabilities"
        enter={start('capabilities-requires')}
        frame={frame}
        look={look}
        cards={[
          {
            at: start('capabilities-requires'),
            title: 'capabilities/launch-site.ts',
            code: s.capabilitiesLaunchSite,
            steps: steps(s.capabilitiesLaunchSite, [
              cue('capabilities-requires', 'Provides'),
              'provides: (self)',
            ]),
          },
          {
            at: cue('capabilities-requires', 'and each Rocket', -lead),
            title: 'capabilities/rocket.ts',
            code: s.capabilitiesRocket,
            steps: steps(s.capabilitiesRocket, [
              cue('capabilities-requires', 'and each Rocket'),
              'requires:',
            ]),
          },
          {
            at: cue('capabilities-requires', 'Leave it out', -lead),
            title: 'capabilities/launch-site.ts',
            code: withoutWeather,
            rows: 18,
            steps: steps(withoutWeather, [
              cue('capabilities-requires', 'Leave it out'),
              'children:',
            ]),
            problem: {
              at: cue('capabilities-requires', 'Leave it out', 0.4),
              line: blockOf(withoutWeather, 'children:')[0],
              ...missingWeather,
            },
          },
          {
            at: cue('capabilities-command', undefined, -lead),
            title: 'capabilities/rocket.ts',
            code: s.capabilitiesRocket,
            steps: steps(s.capabilitiesRocket, [
              cue('capabilities-command'),
              'Launch: (_',
            ]),
          },
        ]}
        clips={[
          {
            id: 'c4-capabilities',
            from: cue('capabilities-command', 'an Effect'),
            until: start('motion'),
          },
        ]}
      />

      <Region
        at={at.motion}
        chapter={5}
        title="Motion"
        enter={start('motion')}
        frame={frame}
        look={look}
        cards={[
          {
            at: start('motion'),
            title: 'motion/view.tsx',
            code: s.motionView,
            lang: 'tsx',
            steps: steps(
              s.motionView,
              [cue('motion'), 'layoutId={id}'],
              [cue('motion', 'Motion glides'), 'layoutId={id}', 'InFlight:'],
            ),
          },
        ]}
        clips={[
          {
            id: 'c5-motion',
            from: start('motion'),
            until: start('time-log'),
          },
        ]}
      />

      <Region
        at={at.time}
        chapter={6}
        title="Time Travel"
        enter={start('time-log')}
        frame={frame}
        look={look}
        clips={[
          {
            id: 'c6-timetravel',
            from: cue('time-log'),
            until: cue('deeper-lifetimes', undefined, -1.6),
          },
        ]}
      />

      <Place at={deeper.title}>
        <PlateTitle
          title="Going deeper"
          frame={frame}
          enter={cue('deeper-lifetimes', undefined, -1.4)}
          chapter={6}
        />
      </Place>
      <Plate
        at={plates.lifetimes}
        title="Lifetimes"
        frame={frame}
        enter={cue('deeper-lifetimes', undefined, -1.4)}
        chapter={0}
      >
        <Lifetimes
          frame={frame}
          enter={cue('deeper-lifetimes')}
          state={cue('deeper-lifetimes', 'one for a single')}
        />
      </Plate>
      <Plate
        at={plates.commands}
        title="Commands"
        frame={frame}
        enter={cue('deeper-lifetimes', undefined, -1.4)}
        chapter={1}
      >
        <div className="flex flex-col gap-8">
          <CodeCard
            title="commands/rocket.ts"
            code={s.commandsRocket}
            frame={frame}
            rows={9}
            width={plateWidth}
            steps={steps(
              s.commandsRocket,
              [cue('deeper-commands'), "key: 'countdown'"],
              [
                cue('deeper-commands', 'Launch twice'),
                'Launch: ()',
                'Countdown: {',
              ],
              [cue('deeper-commands', 'Abort'), 'Abort: ()'],
            )}
          />
          <Footage
            look={look}
            clip="d1-commands"
            frame={frame}
            from={cue('deeper-commands')}
            until={cue('deeper-rendering', undefined, -0.3)}
            width={plateWidth}
          />
        </div>
      </Plate>
      <Plate
        at={plates.rendering}
        title="Rendering"
        frame={frame}
        enter={cue('deeper-lifetimes', undefined, -1.4)}
        chapter={2}
      >
        <Rendering
          frame={frame}
          send={cue('deeper-rendering', undefined, 0.2)}
          only={cue('deeper-rendering', 'only the View')}
        />
      </Plate>
      <Plate
        at={plates.replay}
        title="Replay"
        frame={frame}
        enter={cue('deeper-lifetimes', undefined, -1.4)}
        chapter={3}
      >
        <Replay
          frame={frame}
          enter={cue('deeper-replay')}
          skip={cue('deeper-replay', 'Replay runs')}
          live={cue('deeper-replay', 'Lifetimes start')}
        />
      </Plate>
      <Plate
        at={plates.inspector}
        title="Inspector"
        frame={frame}
        enter={cue('deeper-lifetimes', undefined, -1.4)}
        chapter={4}
      >
        <Footage
          look={look}
          clip="d2-inspector"
          frame={frame}
          from={cue('deeper-inspector', undefined, -0.4)}
          until={cue('close', undefined, -1)}
          width={plateWidth}
        />
      </Plate>
    </>
  );
}

// A Going deeper topic: its title above its drawing, centred on `at`.
function Plate({
  at: centre,
  title,
  frame,
  enter,
  chapter,
  children,
}: {
  at: Point;
  title: string;
  frame: number;
  enter: number;
  chapter: number;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute flex flex-col gap-8"
      style={{
        left: centre.x - plateWidth / 2,
        top: centre.y - 380,
        width: plateWidth,
        opacity: ease(frame, enter, 0.6),
      }}
    >
      <PlateTitle title={title} frame={frame} enter={enter} chapter={chapter} />
      {children}
    </div>
  );
}

function Overlay({ frame, cue }: DrawingProps) {
  return (
    <>
      <TitleCard
        title="Effect Oak"
        frame={frame}
        enter={-1}
        exit={cue('actor-model', undefined, -0.9)}
      />
      <TitleCard
        title="Going deeper"
        frame={frame}
        enter={cue('deeper-lifetimes', undefined, -2.8)}
        exit={cue('deeper-lifetimes', undefined, -0.7)}
        scrim={0.92}
      />
      <TitleCard
        title="Effect Oak"
        detail="docs.kishore.app/demos/effect-oak/rockets"
        frame={frame}
        enter={cue('close', undefined, 1.6)}
        scrim={0.86}
      />
    </>
  );
}

export const effectOak = defineWalkthrough({
  id: 'effect-oak',
  voiceover,
  pauses,
  tail: 4,
  look: 'exotic',
  path,
  sounds,
  canvas: Drawing,
  overlay: Overlay,
});
