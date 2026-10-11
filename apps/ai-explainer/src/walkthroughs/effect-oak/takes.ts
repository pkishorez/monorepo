import type { Stage, Take } from '../../foundation/walkthrough/index.ts';

// How each beat is held and what the cursor does in it, in seconds from the
// beat's start. A Rocket's flight runs on its Lifetimes: Ascending 1.9 s,
// Separating 1.4 s, then it burns 5 fuel every 0.7 s while Cruising;
// Descending takes 3.4 s, Returning 2.4 s. Under 30 fuel at Land, it crashes.

/** The page the recorder plays, under the docs app's address. */
export const page = '/demos/apps/showreel?record=1';

const rocket = (name: string) => new RegExp(`^${name}: OnPad`);

export const takes: Record<string, Take<Stage>> = {
  open: { hold: 7 },

  'actor-send': {
    rest: 2.4,
    play: async (s) => {
      await s.at(1.2);
      await s.clicks(/^R-1/, 5, undefined, 0.55);
    },
  },
  'actor-end': { rest: 2.6 },

  'state-fly': {
    hold: 21,
    play: async (s) => {
      await s.at(4.4);
      await s.clicks(rocket('R-1'), 4, undefined, 0.35);
      await s.at(6.6);
      await s.click('Launch', 'R-1');
      await s.at(12.2);
      await s.click('Land', 'R-1');
      await s.at(16.8);
      await s.click('Return', 'R-1 landing');
    },
  },
  // Forty fuel, cruising from about 5.5 s: by 8.6 s it has under 30, and it
  // would only run dry at about 11 s.
  'state-crash': {
    lead: 8.4,
    hold: 15,
    play: async (s) => {
      await s.at(0.4);
      await s.clicks(rocket('R-1'), 2, undefined, 0.35);
      await s.at(1.6);
      await s.click('Launch', 'R-1');
      await s.at(8.6);
      await s.click('Land', 'R-1');
      await s.at(13.6);
      await s.click('Rebuild', 'R-1 landing');
    },
  },
  'state-lost': {
    lead: 7.8,
    hold: 13,
    play: async (s) => {
      await s.at(0.4);
      await s.clicks(rocket('R-1'), 1);
      await s.at(1.2);
      await s.click('Launch', 'R-1');
      await s.at(11.8);
      await s.click('Rebuild', 'R-1');
    },
  },
  'state-end': { rest: 2.6 },

  'lifetime-steps': {
    hold: 9.5,
    play: async (s) => {
      await s.at(0.8);
      await s.clicks(rocket('R-1'), 5, undefined, 0.3);
      await s.at(2.6);
      await s.click('Launch', 'R-1');
    },
  },
  'lifetime-burn': {
    hold: 10,
    play: async (s) => {
      await s.at(4.4);
      await s.click('Land', 'R-1');
    },
  },
  'lifetime-whole': {
    play: async (s) => {
      await s.at(1);
      await s.click('Return', 'R-1 landing');
    },
  },
  'lifetime-end': { rest: 2.6 },

  'children-view': {
    hold: 11,
    play: async (s) => {
      await s.at(1.6);
      await s.clicks('Build a rocket', 6, undefined, 0.9);
    },
  },
  'children-each': {
    hold: 13,
    play: async (s) => {
      await s.at(0.8);
      await s.clicks(rocket('R-2'), 4, undefined, 0.3);
      await s.at(2.6);
      await s.click('Launch', 'R-2');
      await s.at(3.6);
      await s.clicks(rocket('R-6'), 5, undefined, 0.3);
      await s.at(5.8);
      await s.click('Launch', 'R-6');
      await s.at(8.8);
      await s.click('Land', 'R-2');
    },
  },
  'children-end': { rest: 2.6 },

  'capabilities-compile': { rest: 1.8 },
  // The site zooms out as rockets are built; fuel once it has settled.
  'capabilities-storm': {
    lead: 4.4,
    hold: 14.5,
    play: async (s) => {
      await s.at(0.3);
      await s.clicks('Build a rocket', 2, undefined, 0.8);
      await s.at(2.8);
      await s.clicks(rocket('R-2'), 4, undefined, 0.3);
      await s.at(4.6);
      await s.click('Clear sky');
      await s.at(6);
      await s.click('Launch', 'R-2');
      await s.at(9.4);
      await s.click('Storm');
      await s.at(10.4);
      await s.click('Launch', 'R-2');
    },
  },
  'capabilities-hangar': {
    hold: 13,
    play: async (s) => {
      await s.at(1);
      await s.click('Land', 'R-2');
      await s.at(7.6);
      await s.click('Dismantle', 'R-2 landing');
    },
  },
  'capabilities-end': { rest: 2.6 },

  wiring: { rest: 2 },
  'wiring-renders': {
    hold: 9.5,
    play: async (s) => {
      await s.at(3.6);
      await s.clicks(rocket('R-1'), 2, undefined, 0.8);
      await s.at(5.8);
      await s.clicks(rocket('R-3'), 1);
    },
  },
  'wiring-end': { rest: 2.6 },

  // The rocket lands before the next beat, so the Timeline is still while
  // the cursor steps back through it.
  time: {
    hold: 15.5,
    play: async (s) => {
      await s.at(3.6);
      await s.clicks(rocket('R-1'), 3, undefined, 0.3);
      await s.at(5);
      await s.click('Launch', 'R-1');
      await s.at(10.6);
      await s.click('Land', 'R-1');
    },
  },
  'time-step': {
    hold: 10,
    play: async (s) => {
      for (const at of [0.8, 1.4, 2, 2.6]) {
        await s.at(at);
        await s.press('ArrowDown', '↓');
      }
      await s.at(4.4);
      await s.click(/^Launch/, 'Devtools');
    },
  },
  'time-branch': {
    hold: 9.5,
    play: async (s) => {
      await s.at(0.8);
      await s.click('Fork here', 'Devtools');
      await s.at(2.6);
      await s.click('Launch', 'R-1');
      await s.at(8.4);
      await s.click('Land', 'R-1');
    },
  },
  'time-inspector': {
    hold: 7,
    play: async (s) => {
      await s.at(0.6);
      await s.tab('Inspector');
    },
  },

  'react-all': { rest: 2 },
  close: { hold: 8 },
};
