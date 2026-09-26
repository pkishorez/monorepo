import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { snapshotOf } from './helpers.js';

describe('snapshot compatibility', () => {
  it('keeps canonical JSON stable', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const parent = ESchema.make('Parent', { child: toSchema(child) })
      .evolve('v2', { count: Schema.Number }, (previous) => ({
        ...previous,
        count: 0,
      }))
      .build();
    const snapshot = snapshotOf(parent);

    expect(JSON.stringify(snapshot.schemas)).toBe(
      JSON.stringify([
        {
          identity: 'Child',
          kind: 'struct',
          idField: null,
          versions: [
            {
              version: 'v1',
              shape: {
                type: 'struct',
                fields: [{ name: 'value', type: { type: 'string' } }],
              },
            },
          ],
        },
        {
          identity: 'Parent',
          kind: 'struct',
          idField: null,
          versions: [
            {
              version: 'v1',
              shape: {
                type: 'struct',
                fields: [
                  { name: 'child', type: { type: 'ref', identity: 'Child' } },
                ],
              },
            },
            {
              version: 'v2',
              shape: {
                type: 'struct',
                fields: [
                  { name: 'child', type: { type: 'ref', identity: 'Child' } },
                  { name: 'count', type: { type: 'number' } },
                ],
              },
            },
          ],
        },
      ]),
    );
  });
});
