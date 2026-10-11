/*
 * The Effect Oak Walkthrough, beat by beat: what the narrator says and what
 * happens on screen. Plain data with no imports, so the video speaks the
 * same script; how long each beat holds is the video's business.
 */

export const CHAPTERS = [
  { n: 0, title: 'Effect Oak', idea: 'Music, the name, and in.' },
  { n: 1, title: 'Actor', idea: 'A Model, Messages, an Update, and a View.' },
  { n: 2, title: 'State', idea: 'One rocket, many situations.' },
  { n: 3, title: 'Lifetime', idea: 'Work that runs while a State lasts.' },
  { n: 4, title: 'Children', idea: 'A Fleet of Rockets.' },
  {
    n: 5,
    title: 'Capabilities',
    idea: 'What a parent gives everything below it.',
  },
  { n: 6, title: 'Wiring it up', idea: 'An Actor and its View become React.' },
  {
    n: 7,
    title: 'Time Travel',
    idea: 'The Log, Steps, Branches, the Inspector.',
  },
  { n: 8, title: "It's just React", idea: 'Motion, hooks, and the rest.' },
] as const;

export type Beat = {
  readonly id: string;
  readonly chapter: number;
  readonly title: string;
  /** What the narrator says. Empty for music only. */
  readonly say: string;
  /** What happens on screen while it is said. */
  readonly direction: string;
};

export const SCRIPT: ReadonlyArray<Beat> = [
  {
    id: 'open',
    chapter: 0,
    title: 'Open',
    say: '',
    direction:
      'Music only. "Effect Oak" fades up in the centre, holds, and the music falls away as the title fades into an empty frame.',
  },

  {
    id: 'actor',
    chapter: 1,
    title: 'Everything is an Actor',
    say: "Everything in Effect Oak is an Actor. An Actor keeps a Model, accepts Messages, and changes its Model when a Message arrives. That's the whole idea. Let's build one: a rocket.",
    direction:
      '"1 · Actor" rises in the centre, then settles small in the top left. The first two lines of the Rocket appear on the left.',
  },
  {
    id: 'actor-model',
    chapter: 1,
    title: 'The Model',
    say: "A rocket's Model is how much fuel it holds. Just a number, described with Schema.",
    direction: 'The model line slides in; everything else dims.',
  },
  {
    id: 'actor-message',
    chapter: 1,
    title: 'Messages',
    say: 'It accepts one Message: Fuel. A Message is a fact, something that happened: someone fuelled the rocket.',
    direction: 'The message line slides in under the model.',
  },
  {
    id: 'actor-build',
    chapter: 1,
    title: 'Build it: init and update',
    say: 'Now build it. init gives the initial Model: an empty tank. update says what each Message does: Fuel adds twenty, up to a hundred. Update is pure. It only returns the next Model.',
    direction: 'build() opens below; init lights up, then update.',
  },
  {
    id: 'actor-view',
    chapter: 1,
    title: 'A View',
    say: 'To see the rocket, give it a View. View.make takes the Actor and a plain React component. The component gets the Model, at whatever moment the rocket is in, and draws it.',
    direction:
      'The View appears below the Actor. As the Ship line lands, the rocket fades up on the right, empty, on its pad.',
  },
  {
    id: 'actor-send',
    chapter: 1,
    title: 'Send',
    say: 'Clicking the rocket sends Fuel. The Update runs, the Model changes, and the View draws the new fuel.',
    direction:
      'The onClick line lights up. The cursor clicks the rocket, again and again; amber fuel rises inside it until it is full.',
  },
  {
    id: 'actor-end',
    chapter: 1,
    title: 'Hand-off',
    say: "A Model, Messages, an Update, and a View. But a rocket doesn't just sit there. It launches, it flies, it lands, and at each of those moments it behaves differently.",
    direction: 'All the code lights up again for a beat. Quiet.',
  },

  {
    id: 'state',
    chapter: 2,
    title: 'States',
    say: 'A rocket on the pad and a rocket in the sky are in different situations. Effect Oak calls them States, and a rocket is always in exactly one.',
    direction:
      '"2 · State" rises and settles. The state block slides into the Actor. On the right, a landing pad fades in beside the launch pad, and the strip of States appears below.',
  },
  {
    id: 'state-steps',
    chapter: 2,
    title: 'One step at a time',
    say: 'Each step of the flight is its own State: lift off, drop the boosters, cruise, come down, land, and roll back to the pad. Small States are easy to draw, and easy to reason about.',
    direction: 'The States light up in the code as they are named.',
  },
  {
    id: 'state-update',
    chapter: 2,
    title: 'Update, per State',
    say: "Update is now written per State. On the pad, the rocket takes Fuel and Launch. In the air, it takes Land. A Message with no rule in the current State is ignored: you can't fuel a rocket in the sky.",
    direction: 'OnPad lights up, then Cruising.',
  },
  {
    id: 'state-data',
    chapter: 2,
    title: 'Data that lives in a State',
    say: "Some data only exists in one State. When you press Land, Update reads the fuel. Enough, and the descent is safe; too little, and it isn't. That answer lives on the Descending State.",
    direction: 'The Land rule lights up, then `safe` on Descending.',
  },
  {
    id: 'state-fly',
    chapter: 2,
    title: 'Fly it',
    say: 'The View draws each State its own way, and Motion moves the rocket from one to the next. Fuel it up, and launch.',
    direction:
      'The eye goes right. Fuel to eighty, Launch. Lift-off with the boosters firing; the boosters fall away; it leans and cruises left, up and right. Land: the landing pad goes solid, and it comes down upright onto it. Return: it drops below the ground, slides left, and rises onto its launch pad. The strip of States follows every step.',
  },
  {
    id: 'state-crash',
    chapter: 2,
    title: 'Not every flight ends well',
    say: "Land with too little fuel, and it doesn't end well.",
    direction:
      'Forty fuel and Launch. Once the fuel is under thirty, Land: it wobbles down and breaks apart on its landing pad. Rebuild.',
  },
  {
    id: 'state-lost',
    chapter: 2,
    title: 'Lost',
    say: 'Run dry in the air, and the rocket is lost.',
    direction:
      'Twenty fuel and Launch, and no Land: the tank runs dry, and the rocket drifts off and fades into the sky. Rebuild.',
  },
  {
    id: 'state-end',
    chapter: 2,
    title: 'Hand-off',
    say: 'But nobody clicked to drop the boosters, or to burn the fuel. So what moved the rocket along?',
    direction: 'Quiet.',
  },

  {
    id: 'lifetime',
    chapter: 3,
    title: 'Lifetime',
    say: 'A Lifetime: an Effect that runs for as long as one State lasts. When the rocket leaves the State, its Lifetime is interrupted. There is nothing to clean up by hand.',
    direction:
      '"3 · Lifetime" rises and settles. The lifetime block slides in.',
  },
  {
    id: 'lifetime-steps',
    chapter: 3,
    title: 'Each step hands over',
    say: 'While Ascending, wait, then tell the rocket its boosters are spent. Separating waits, then sends Steadied. Each step hands over to the next.',
    direction:
      'The two Lifetimes light up; on the right a launch plays alongside them.',
  },
  {
    id: 'lifetime-burn',
    chapter: 3,
    title: 'Burning fuel',
    say: 'While Cruising, burn fuel, forever. Forever is safe here: landing leaves the State, and the loop stops on its own.',
    direction:
      'The Cruising Lifetime lights up; the fuel in the cruising rocket drains, step by step. Land: the draining stops.',
  },
  {
    id: 'lifetime-whole',
    chapter: 3,
    title: "The whole Instance's Lifetime",
    say: "A Lifetime can also span the rocket's whole life. Do something when it starts, run as many fibers as you like while it lives, and add a finaliser for when it stops. It's just a scoped Effect.",
    direction: 'The three comments light up one after the other.',
  },
  {
    id: 'lifetime-end',
    chapter: 3,
    title: 'Hand-off',
    say: 'One rocket is a start. A launch site needs a fleet.',
    direction: 'Quiet.',
  },

  {
    id: 'children',
    chapter: 4,
    title: 'A Fleet is an Actor too',
    say: 'A Fleet is an Actor too. Its Model is a list of rocket names, and it accepts Build and Dismantle.',
    direction:
      '"4 · Children" rises and settles. The code changes to fleet.ts.',
  },
  {
    id: 'children-many',
    chapter: 4,
    title: 'Actor.many',
    say: 'Each name becomes a Rocket of its own: a Child. The Model decides which Children exist. Add a name, and a Rocket starts. Remove it, and it stops, along with every Lifetime it was running.',
    direction: 'children and invoke light up.',
  },
  {
    id: 'children-view',
    chapter: 4,
    title: 'The Fleet View',
    say: 'The Fleet View lays the rockets out, and draws each one with its own View. Build one, and the others make room. Every rocket gets a launch pad and a landing pad.',
    direction:
      'Build, again and again: the rockets slide left to make room, each new one takes the rightmost pad, and the site zooms out a little each time. Past five, a new row begins.',
  },
  {
    id: 'children-each',
    chapter: 4,
    title: 'Each one on its own',
    say: "Each Rocket is its own Instance, with its own Model and its own State. Fuel one, launch another: they don't share a thing.",
    direction: 'Fuel and launch two rockets; land one while the other cruises.',
  },
  {
    id: 'children-end',
    chapter: 4,
    title: 'Hand-off',
    say: "But dismantling a rocket is the Fleet's job, and a Rocket can't reach its Fleet. Not yet.",
    direction: 'Quiet.',
  },

  {
    id: 'capabilities',
    chapter: 5,
    title: 'Provides and Requires',
    say: 'Some things belong to the whole site, not to one rocket, like the weather. The Fleet Provides Weather to everything below it, and each Rocket Requires it.',
    direction:
      '"5 · Capabilities" rises and settles. provides and requires light up.',
  },
  {
    id: 'capabilities-compile',
    chapter: 5,
    title: 'Checked by the compiler',
    say: "Forget to Provide it, and the app doesn't compile.",
    direction:
      'The provides lines strike through; a red squiggle runs under the Rocket, with what is missing.',
  },
  {
    id: 'capabilities-command',
    chapter: 5,
    title: 'A Command',
    say: "Update can't look at the sky: it's pure. So Launch asks for a Command, an Effect that reads the weather and sends back Cleared, or Scrubbed.",
    direction: 'Launch, then checkTheSky, light up.',
  },
  {
    id: 'capabilities-storm',
    chapter: 5,
    title: 'Storm',
    say: 'Bring in a storm, and try to launch. The rocket shakes, and stays on the pad. Clear skies, and it goes.',
    direction:
      'Storm: rain fades in, falling from the top right to the bottom left. Launch: the rocket shakes; "Storm overhead". Clear: the rain fades out. Launch again: it goes.',
  },
  {
    id: 'capabilities-hangar',
    chapter: 5,
    title: 'Talking to the parent',
    say: 'A Capability is also how a Child talks to its parent. The Fleet Provides a Hangar, and a landed Rocket asks it to dismantle the rocket, without knowing where its Fleet is.',
    direction:
      'Land, then Dismantle: the rocket fades, its pads go, the others close the gap, and the site zooms back in a little.',
  },
  {
    id: 'capabilities-end',
    chapter: 5,
    title: 'Hand-off',
    say: "That's the whole app. So how does it get on the page?",
    direction: 'Quiet.',
  },

  {
    id: 'wiring',
    chapter: 6,
    title: 'toReact',
    say: 'toReact takes an Actor, its View, and a Layer for whatever the root Requires, and gives back a React component. Mount it like any other.',
    direction:
      '"6 · Wiring it up" rises and settles. As <App /> lands, the app lifts forward in a card labelled <App />, then settles back.',
  },
  {
    id: 'wiring-renders',
    chapter: 6,
    title: 'Only what changed draws again',
    say: 'Behind it, one Runtime runs every Actor, outside React. When a Message changes one Rocket, only that Rocket draws again.',
    direction:
      'Fuel one rocket: a thin outline flashes around that rocket only.',
  },
  {
    id: 'wiring-end',
    chapter: 6,
    title: 'Hand-off',
    say: 'And because every change is a Message, the Runtime remembers every one of them.',
    direction: 'Quiet.',
  },

  {
    id: 'time',
    chapter: 7,
    title: 'The Log',
    say: 'Every click, every Lifetime tick, every Command result is a Message, and every Message is in the Log.',
    direction:
      '"7 · Time Travel" rises and settles. The code fades, the app glides to the left, and the devtools slide in on the right. Fuel and launch: Messages stream into the Timeline.',
  },
  {
    id: 'time-step',
    chapter: 7,
    title: 'Step back',
    say: 'Pick any Message, and the app is drawn as it was right after it, animations and all. The rocket floats back down to its pad.',
    direction: 'Step back through the Timeline; the rocket glides back down.',
  },
  {
    id: 'time-branch',
    chapter: 7,
    title: 'Branch',
    say: 'Start again from that moment, and a new Branch grows beside the old one. Both stay in the Log.',
    direction: 'Start from the picked Step; a new lane opens in the Timeline.',
  },
  {
    id: 'time-inspector',
    chapter: 7,
    title: 'Inspector',
    say: 'The Inspector maps the whole app: every Actor, every State, and what each Message changed.',
    direction: 'The devtools switch to the Inspector.',
  },

  {
    id: 'react',
    chapter: 8,
    title: 'A plain React component',
    say: "The rocket you've watched all along is a plain React component. Motion reads the State, and moves it.",
    direction:
      '"8 · It\'s just React" rises and settles. The devtools slide out, the app glides back to the right, and the drawing code appears on the left.',
  },
  {
    id: 'react-all',
    chapter: 8,
    title: 'Everything you know',
    say: 'Because the View only reads the Model and State, Time Travel draws it just like the live app. Hooks, context, your component library: everything you know from React still applies.',
    direction: 'The flight table lights up, State by State.',
  },
  {
    id: 'close',
    chapter: 8,
    title: 'Close',
    say: 'Effect Oak.',
    direction:
      'The code and the app fade; "Effect Oak" returns in the centre; the music comes back and ends.',
  },
];
