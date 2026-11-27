import { describe, expect, it } from 'vitest';
import type { DataOf } from '@kestack/kabuki/types';
import {
  branchOf,
  bringOf,
  lookedCard,
  timelineOf,
} from '../logic/shared/index.ts';
import type { RunningShape } from '../logic/shared/index.ts';
import type {
  BlueprintNode,
  Entry,
  Step,
} from '../../../../services/kabuki-session/contract/index.ts';

const entry = (id: number, parent: number | null, to = 'Counter'): Entry => ({
  id,
  parent,
  to,
  tag: 'Bumped',
  from: { kind: 'outside' },
  at: id,
  outcome: id === 2 ? 'ignored' : 'handled',
});

const entries = [
  entry(1, null),
  entry(2, 1),
  entry(3, 2, 'Counter/page#1'),
  entry(4, 1),
  entry(5, 4),
];

const data = (
  seeking: Step | null,
  branch: number | null = null,
): DataOf<typeof RunningShape> =>
  ({
    model: {
      presenting: false,
      place: 'bottom',
      print: null,
      now: {
        head: 3,
        seeking,
        running: true,
        failure: null,
        url: '',
        revision: 1,
      },
      entries,
      branch,
      look: null,
      opened: [],
      closed: null,
      playing: false,
      problem: null,
    },
  }) as unknown as DataOf<typeof RunningShape>;

const ids = (path: ReadonlyArray<Entry>) => path.map(({ id }) => id);

describe('the Branch in view', () => {
  it("is the Head's, from the History's start", () => {
    expect(ids(branchOf(entries, null, 3))).toEqual([1, 2, 3]);
  });

  it("is the Head's when it passes through the entry picked", () => {
    expect(ids(branchOf(entries, 2, 3))).toEqual([1, 2, 3]);
  });

  it('is the newest Branch through the entry picked, else, to its end', () => {
    expect(ids(branchOf(entries, 4, 3))).toEqual([1, 4, 5]);
  });
});

describe('the Timeline', () => {
  it('ticks each Step of the Branch in view, by what came of its Message, at the Head', () => {
    expect(timelineOf(data(null))).toMatchObject({
      at: null,
      ticks: [
        { id: 1, label: 'Bumped → Counter', tone: 'took' },
        { id: 2, label: 'Bumped → Counter · no rule took it', tone: 'ignored' },
        { id: 3, label: 'Bumped → page#1', tone: 'took' },
      ],
      next: [],
    });
  });

  it('offers each way on where the History splits, the one in view pressed', () => {
    expect(timelineOf(data(1))).toMatchObject({
      at: 0,
      next: [
        { id: 2, on: true },
        { id: 4, on: false },
      ],
    });
    expect(timelineOf(data(1, 4))).toMatchObject({
      ticks: [{ id: 1 }, { id: 4 }, { id: 5 }],
      next: [
        { id: 2, on: false },
        { id: 4, on: true },
      ],
    });
  });

  it("shows the History's start before the first Step", () => {
    expect(timelineOf(data('start'))).toMatchObject({ at: -1, next: [] });
  });
});

describe('what the canvas brings into view', () => {
  it('is the card a past Step’s Message was for', () => {
    expect(bringOf(data(3))).toEqual({ id: 'Counter/page#1', key: 'step:3' });
  });

  it('is the whole tree once back at the Head', () => {
    expect(bringOf(data(null))).toEqual({ key: 'now' });
  });
});

const nothing = { kind: 'struct', fields: [] } as const;

const print = (
  place: string,
  children: ReadonlyArray<BlueprintNode> = [],
): BlueprintNode => ({
  place,
  slot: place.includes('/') ? place.split('/').at(-1)! : null,
  actor: place.includes('/') ? 'Row' : place,
  condition: place.includes('/') ? 'each' : null,
  keyed: false,
  within: null,
  single: true,
  requires: [],
  model: nothing,
  top: { messages: [], workers: [], children: [], queries: [], provides: [] },
  states: {},
  children,
});

describe('the cards at a Step', () => {
  it('are every Instance by its Address, the one its Message was for carrying it', () => {
    const cards = lookedCard(
      print('Shelf', [print('Shelf/rows')]),
      {
        address: 'Shelf',
        place: 'Shelf',
        actor: 'Shelf',
        slot: null,
        state: 'Single',
        change: 'changed',
        children: [
          {
            address: 'Shelf/rows[a]#1',
            place: 'Shelf/rows',
            actor: 'Row',
            slot: 'rows',
            key: 'a',
            state: 'Single',
            change: 'started',
            children: [],
          },
        ],
      },
      entry(4, 3, 'Shelf'),
    );
    expect(cards).toMatchObject({
      id: 'Shelf',
      change: 'changed',
      took: { message: 'Bumped', outcome: 'handled' },
      children: [
        {
          id: 'Shelf/rows[a]#1',
          name: 'rows',
          key: 'a',
          change: 'started',
          print: { place: 'Shelf/rows' },
        },
      ],
    });
    expect(cards?.children[0]).not.toHaveProperty('took');
  });

  it('take the Blueprint of an Actor by its name where its place is not in it, as below a recursive one', () => {
    const cards = lookedCard(
      print('Shelf', [print('Shelf/rows')]),
      {
        address: 'Shelf/rows[a]#1/rows[b]#1',
        place: 'Shelf/rows/rows',
        actor: 'Row',
        slot: 'rows',
        state: 'Single',
        change: null,
        children: [],
      },
      undefined,
    );
    expect(cards?.print.place).toBe('Shelf/rows');
  });
});
