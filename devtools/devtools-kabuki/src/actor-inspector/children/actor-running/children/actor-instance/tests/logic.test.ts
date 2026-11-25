import { describe, expect, it } from 'vitest';
import { acceptedOf } from '../logic/shared/index.ts';
import type { BlueprintNode } from '../../../../../../services/kabuki-session/contract/index.ts';

const nothing = { kind: 'struct', fields: [] } as const;

const level = (...tags: ReadonlyArray<string>) => ({
  messages: tags.map((tag) => ({ tag, payload: nothing })),
  workers: [],
  children: [],
  queries: [],
  provides: [],
});

const door: BlueprintNode = {
  place: 'Door',
  slot: null,
  actor: 'Door',
  condition: null,
  keyed: false,
  within: null,
  single: false,
  requires: [],
  model: nothing,
  top: level('Knocked'),
  states: {
    Closed: { ...level('Pushed', 'Knocked'), data: nothing },
    Opening: { ...level('Swung'), data: nothing },
  },
  children: [],
};

describe('the Messages an Instance accepts', () => {
  it("are its top level's and its State's, each once", () => {
    expect(acceptedOf(door, 'Closed').map(({ tag }) => tag)).toEqual([
      'Knocked',
      'Pushed',
    ]);
    expect(acceptedOf(door, 'Opening').map(({ tag }) => tag)).toEqual([
      'Knocked',
      'Swung',
    ]);
  });

  it('are only its top level’s in a State it does not know', () => {
    expect(acceptedOf(door, 'Gone').map(({ tag }) => tag)).toEqual(['Knocked']);
  });
});
