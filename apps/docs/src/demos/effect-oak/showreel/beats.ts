import { SOURCES, type AppName } from '../rockets/index.js';
import { bare, blockOf, linesOf, without } from './code.js';
import { SCRIPT, type Beat } from './script.js';

/*
 * What the frame shows in each beat of the script: the code on the left, with
 * the lines being explained lit, and which of the Rockets apps runs on the
 * right. Code is cut from the demo's sources wherever it can be.
 */

export type Layout = 'title' | 'code' | 'devtools' | 'close';

export type Shot = Beat & {
  readonly layout: Layout;
  readonly file?: string;
  readonly code?: string;
  /** The lines being explained, 1-based and inclusive. The rest dim. */
  readonly focus?: readonly [number, number];
  /** Which side the eye should be on. The other dims a little. */
  readonly attend?: 'code' | 'app' | 'both';
  readonly app?: AppName;
  /** A one-off moment the frame draws over the code or the app. */
  readonly moment?: 'compile-error' | 'mount' | 'renders' | 'inspector';
};

// Chapter 1: the Rocket grows one part at a time, then its View joins it.
const rocket1 = bare(SOURCES.actorRocket);
const shell1 = `export const Rocket = Actor.make('Rocket', {`;
const model1 = '  model: Schema.Struct({ fuel: Schema.Number }),';
const message1 = '  message: Schema.TaggedUnion({ Fuel: {} }),';
const view1 = bare(SOURCES.actorView);
const viewFirst = view1
  .replace('({ model, send }) => (', '({ model }) => (')
  .replace(" onClick={() => send({ _tag: 'Fuel' })}", '');
const withView = (view: string) => `${rocket1}\n\n${view}`;

// Chapters 2 and 3: the Rocket with States, first without its Lifetimes.
const rocket2 = bare(SOURCES.stateRocket);
const rocket2Bare = without(rocket2, 'lifetime: {');
const lifetimes = (() => {
  const [from, to] = blockOf(rocket2, 'lifetime: {');
  const lines = rocket2.split('\n');
  return [
    lines.find((line) => line.startsWith('}).build'))!,
    "  init: () => ({ model: { fuel: 0 }, state: { _tag: 'OnPad' } }),",
    ...lines.slice(from - 1, to),
    '  update: { /* … */ },',
    '});',
  ].join('\n');
})();

// Chapter 4: the Fleet and its View.
const fleet = bare(SOURCES.fleetFleet);
const fleetView = bare(SOURCES.fleetView);

// Chapter 5: Weather and the Hangar, Provided by the Fleet and Required by each Rocket.
const capabilities = [
  bare(SOURCES.capabilitiesWeather),
  '',
  bare(SOURCES.capabilitiesFleet).split('\n').slice(0, 1).join('\n'),
  '  // …',
  '  provides: [Weather, Hangar],',
  '  children: { rockets: Actor.many(Rocket) },',
  '}).build({',
  '  provides: (self) =>',
  '    Layer.mergeAll(',
  '      Layer.succeed(Weather, {',
  '        sky: self.get.pipe(Effect.map(({ model }) => model.sky)),',
  '      }),',
  '      // …',
  '    ),',
  '});',
  '',
  "export const Rocket = Actor.make('Rocket', {",
  '  requires: { weather: Weather, hangar: Hangar },',
  '  // …',
  '});',
].join('\n');
const rocket5 = bare(SOURCES.capabilitiesRocket);
const command = [
  rocket5
    .slice(
      rocket5.indexOf('const checkTheSky'),
      rocket5.indexOf('const dismantle'),
    )
    .trimEnd(),
  '',
  '// …',
  '    OnPad: {',
  '      Launch: (_, { model }) =>',
  '        model.fuel > 0 ? { command: checkTheSky } : {},',
  "      Cleared: () => ({ state: { _tag: 'Ascending' } }),",
  '      Scrubbed: (_, { model, at }) => ({',
  '        model: { ...model, scrubbedAt: at },',
  '      }),',
  '    },',
].join('\n');
const hangar = [
  bare(SOURCES.capabilitiesHangar),
  '',
  '// The Fleet Provides it',
  'Layer.succeed(Hangar, {',
  "  dismantle: (name) => self.send({ _tag: 'Dismantle', name }),",
  '}),',
  '',
  '// A landed Rocket asks for it, from a Command',
  rocket5
    .slice(
      rocket5.indexOf('const dismantle'),
      rocket5.indexOf('export const Rocket'),
    )
    .trimEnd(),
  '',
  'Landed: {',
  '  Dismantle: (_, { model }) => ({ command: dismantle(model.name) }),',
  '},',
].join('\n');

// Chapter 6: the app as a component.
const wiring = `import { toReact } from 'effect-oak/react'

const App = toReact(Fleet, FleetView, Layer.empty)

createRoot(document.getElementById('root')!).render(<App />)`;

// Chapter 8: the drawing, which is only React and Motion.
const flight = bare(SOURCES.drawFlight);
const flightTable = flight
  .slice(
    flight.indexOf('/** Where a rocket goes in each State'),
    flight.indexOf('const boostersIn'),
  )
  .trimEnd();
const rocketMotion = [
  '<motion.div',
  '  className="absolute top-0 left-0"',
  '  style={{ ...values, originY: 1 }}',
  '  animate={flight(tag, slot, safe, values.opacity.get() < 0.05)}',
  '>',
  '  <Drawing',
  '    fuel={fuel}',
  '    firing={firingIn(tag)}',
  '    boosters={boostersIn(tag)}',
  '  />',
  '</motion.div>',
  '',
  flightTable,
].join('\n');

type Look = Omit<Shot, keyof Beat>;

const LOOKS: Record<string, Look> = {
  open: { layout: 'title' },

  actor: {
    layout: 'code',
    file: 'rocket.ts',
    code: `${shell1}\n})`,
    focus: [1, 2],
    attend: 'code',
  },
  'actor-model': {
    layout: 'code',
    file: 'rocket.ts',
    code: `${shell1}\n${model1}\n})`,
    focus: [2, 2],
    attend: 'code',
  },
  'actor-message': {
    layout: 'code',
    file: 'rocket.ts',
    code: `${shell1}\n${model1}\n${message1}\n})`,
    focus: [3, 3],
    attend: 'code',
  },
  'actor-build': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket1,
    focus: linesOf(rocket1, '}).build', '});'),
    attend: 'code',
  },
  'actor-view': {
    layout: 'code',
    file: 'rocket.ts · view.tsx',
    code: withView(viewFirst),
    focus: linesOf(withView(viewFirst), 'RocketView', '));'),
    attend: 'both',
    app: 'actor',
  },
  'actor-send': {
    layout: 'code',
    file: 'rocket.ts · view.tsx',
    code: withView(view1),
    focus: linesOf(withView(view1), 'onClick'),
    attend: 'app',
    app: 'actor',
  },
  'actor-end': {
    layout: 'code',
    file: 'rocket.ts · view.tsx',
    code: withView(view1),
    attend: 'both',
    app: 'actor',
  },

  state: {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    focus: blockOf(rocket2Bare, 'state: Schema'),
    attend: 'code',
    app: 'state',
  },
  'state-steps': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    focus: linesOf(rocket2Bare, 'OnPad: {}', 'Lost: {}'),
    attend: 'code',
    app: 'state',
  },
  'state-update': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    focus: blockOf(rocket2Bare, 'OnPad: {', 'update:'),
    attend: 'code',
    app: 'state',
  },
  'state-data': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    focus: linesOf(rocket2Bare, 'Land: (_', "'Descending', safe"),
    attend: 'code',
    app: 'state',
  },
  'state-fly': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    attend: 'app',
    app: 'state',
  },
  'state-crash': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    focus: linesOf(rocket2Bare, 'TouchedDown: (_', "'Crashed'"),
    attend: 'app',
    app: 'state',
  },
  'state-lost': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    focus: linesOf(rocket2Bare, 'Burned: (_', "'Lost' }"),
    attend: 'app',
    app: 'state',
  },
  'state-end': {
    layout: 'code',
    file: 'rocket.ts',
    code: rocket2Bare,
    attend: 'both',
    app: 'state',
  },

  lifetime: {
    layout: 'code',
    file: 'rocket.ts',
    code: lifetimes,
    focus: linesOf(lifetimes, 'lifetime: {'),
    attend: 'code',
    app: 'state',
  },
  'lifetime-steps': {
    layout: 'code',
    file: 'rocket.ts',
    code: lifetimes,
    focus: linesOf(lifetimes, 'Ascending: (self)', "'Steadied'"),
    attend: 'both',
    app: 'state',
  },
  'lifetime-burn': {
    layout: 'code',
    file: 'rocket.ts',
    code: lifetimes,
    focus: blockOf(lifetimes, 'Cruising: (self)'),
    attend: 'both',
    app: 'state',
  },
  'lifetime-whole': {
    layout: 'code',
    file: 'rocket.ts',
    code: lifetimes,
    focus: blockOf(lifetimes, "'*': () =>"),
    attend: 'code',
    app: 'state',
  },
  'lifetime-end': {
    layout: 'code',
    file: 'rocket.ts',
    code: lifetimes,
    attend: 'both',
    app: 'state',
  },

  children: {
    layout: 'code',
    file: 'fleet.ts',
    code: fleet,
    focus: linesOf(fleet, 'export const Fleet', 'Dismantle: { name'),
    attend: 'code',
    app: 'fleet',
  },
  'children-many': {
    layout: 'code',
    file: 'fleet.ts',
    code: fleet,
    focus: linesOf(fleet, 'children: {', 'rockets: model.rockets.map'),
    attend: 'code',
    app: 'fleet',
  },
  'children-view': {
    layout: 'code',
    file: 'fleet-view.tsx',
    code: fleetView,
    focus: linesOf(fleetView, '<Site', '</Site>'),
    attend: 'app',
    app: 'fleet',
  },
  'children-each': {
    layout: 'code',
    file: 'fleet-view.tsx',
    code: fleetView,
    attend: 'app',
    app: 'fleet',
  },
  'children-end': {
    layout: 'code',
    file: 'fleet-view.tsx',
    code: fleetView,
    attend: 'both',
    app: 'fleet',
  },

  capabilities: {
    layout: 'code',
    file: 'weather.ts · fleet.ts · rocket.ts',
    code: capabilities,
    focus: linesOf(capabilities, 'provides: [Weather', 'requires: {'),
    attend: 'code',
    app: 'capabilities',
  },
  'capabilities-compile': {
    layout: 'code',
    file: 'weather.ts · fleet.ts · rocket.ts',
    code: capabilities,
    focus: linesOf(capabilities, 'provides: [Weather', 'children: {'),
    attend: 'code',
    app: 'capabilities',
    moment: 'compile-error',
  },
  'capabilities-command': {
    layout: 'code',
    file: 'rocket.ts',
    code: command,
    focus: linesOf(command, 'const checkTheSky', '});'),
    attend: 'code',
    app: 'capabilities',
  },
  'capabilities-storm': {
    layout: 'code',
    file: 'rocket.ts',
    code: command,
    focus: linesOf(command, 'Launch: (_', 'checkTheSky }'),
    attend: 'app',
    app: 'capabilities',
  },
  'capabilities-hangar': {
    layout: 'code',
    file: 'hangar.ts',
    code: hangar,
    focus: linesOf(hangar, '// The Fleet Provides it', '}),'),
    attend: 'both',
    app: 'capabilities',
  },
  'capabilities-end': {
    layout: 'code',
    file: 'hangar.ts',
    code: hangar,
    attend: 'both',
    app: 'capabilities',
  },

  wiring: {
    layout: 'code',
    file: 'main.tsx',
    code: wiring,
    focus: [3, 5],
    attend: 'both',
    app: 'capabilities',
    moment: 'mount',
  },
  'wiring-renders': {
    layout: 'code',
    file: 'main.tsx',
    code: wiring,
    attend: 'app',
    app: 'capabilities',
    moment: 'renders',
  },
  'wiring-end': {
    layout: 'code',
    file: 'main.tsx',
    code: wiring,
    attend: 'both',
    app: 'capabilities',
  },

  time: { layout: 'devtools', app: 'capabilities' },
  'time-step': { layout: 'devtools', app: 'capabilities' },
  'time-branch': { layout: 'devtools', app: 'capabilities' },
  'time-inspector': {
    layout: 'devtools',
    app: 'capabilities',
    moment: 'inspector',
  },

  react: {
    layout: 'code',
    file: 'flight.tsx',
    code: rocketMotion,
    focus: linesOf(rocketMotion, '<motion.div', '</motion.div>'),
    attend: 'both',
    app: 'capabilities',
  },
  'react-all': {
    layout: 'code',
    file: 'flight.tsx',
    code: rocketMotion,
    focus: linesOf(rocketMotion, 'export function flight', 'switch'),
    attend: 'both',
    app: 'capabilities',
  },
  close: { layout: 'close' },
};

export const SHOTS: ReadonlyArray<Shot> = SCRIPT.map((beat) => {
  const look = LOOKS[beat.id];
  if (!look) throw new Error(`No look for the beat "${beat.id}"`);
  return { ...beat, ...look };
});
