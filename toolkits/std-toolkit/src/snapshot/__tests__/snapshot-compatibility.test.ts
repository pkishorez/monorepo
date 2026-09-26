import { createHash } from 'node:crypto';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { snapshotOf } from './helpers.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

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

    expect(sha256(JSON.stringify(snapshot))).toBe(
      'e6e7033d6a851b04eec1dec86ce2b39f77df102d6b2957f608b3c901485464f8',
    );
  });
});
