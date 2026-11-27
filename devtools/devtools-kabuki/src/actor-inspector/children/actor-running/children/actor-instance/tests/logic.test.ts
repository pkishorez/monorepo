import { describe, expect, it } from 'vitest';
import { init, updates } from '../logic/index.ts';
import { acceptedOf, messageOf } from '../logic/shared/index.ts';
import { draftOf, inputOf } from '../../../../../logic/shared/index.ts';
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

describe('a Send', () => {
  const data = (sending: string | null) => ({
    model: { ...init({ address: 'Door' }).model, sending },
    state: { _tag: 'Single' } as const,
    props: { at: null, revision: 0, print: door, state: 'Closed' },
    at: 0,
  });

  it('goes out while none is in flight', () => {
    const sent = updates.Submitted!(
      { _tag: 'Submitted', tag: 'Knocked', message: { _tag: 'Knocked' } },
      data(null),
    );
    expect(sent.model).toEqual({ sending: 'Knocked', outcome: null });
    expect(sent.command).toBeDefined();
  });

  it('is dropped while another one is in flight, whichever Message it is', () => {
    expect(
      updates.Submitted!(
        { _tag: 'Submitted', tag: 'Pushed', message: { _tag: 'Pushed' } },
        data('Knocked'),
      ),
    ).toEqual({});
  });
});

describe('what came of a Send', () => {
  const said = {
    model: {
      ...init({ address: 'Door' }).model,
      outcome: { tag: 'Knocked', said: 'handled' as const },
    },
    state: { _tag: 'Single' } as const,
    props: { at: null, revision: 0, print: door, state: 'Closed' },
    at: 0,
  };

  it('is shown until its form changes', () => {
    expect(updates.Edited!({ _tag: 'Edited', tag: 'Knocked' }, said)).toEqual({
      model: { outcome: null },
    });
  });

  it('stays while another Message’s form changes', () => {
    expect(updates.Edited!({ _tag: 'Edited', tag: 'Pushed' }, said)).toEqual(
      {},
    );
  });
});

describe('a Message built from its form', () => {
  it('is its payload with its tag', () => {
    const input = inputOf({
      kind: 'struct',
      fields: [
        {
          name: 'by',
          shape: { kind: 'number' },
          optional: false,
          nullable: false,
        },
      ],
    });
    expect(messageOf('Knocked', input, { by: '2' })).toEqual({
      _tag: 'Built',
      value: { _tag: 'Knocked', by: 2 },
    });
  });

  it('carries nothing for a Message with no fields', () => {
    const input = inputOf(nothing);
    expect(messageOf('Knocked', input, draftOf(input))).toEqual({
      _tag: 'Built',
      value: { _tag: 'Knocked' },
    });
  });
});
