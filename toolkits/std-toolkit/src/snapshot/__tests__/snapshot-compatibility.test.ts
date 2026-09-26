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
      '9fb95d7277f4d885159bfb22f454744644afc83f04ebef735172923a1a2d9013',
    );
  });
});
