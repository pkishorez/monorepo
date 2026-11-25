import { describe, expect, it } from 'vitest';
import { printedCard } from '../logic/shared/index.ts';
import type { BlueprintNode } from '../../../../services/kabuki-session/contract/index.ts';

const nothing = { kind: 'struct', fields: [] } as const;

const print = (
  place: string,
  children: ReadonlyArray<BlueprintNode> = [],
): BlueprintNode => ({
  place,
  slot: place.includes('/') ? place.split('/').at(-1)! : null,
  actor: place,
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

describe('the Blueprint’s cards', () => {
  it('are every Actor the root can grow, each by its place and named by its slot', () => {
    expect(printedCard(print('Shelf', [print('Shelf/rows')]))).toMatchObject({
      id: 'Shelf',
      name: 'Shelf',
      state: null,
      change: null,
      children: [{ id: 'Shelf/rows', name: 'rows', state: null }],
    });
  });
});
