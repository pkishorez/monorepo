import { createHash } from 'node:crypto';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { Snapshot } from '../index.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

describe('snapshot compatibility', () => {
  it('keeps canonical JSON and rendered text stable', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const parent = ESchema.make('Parent', { child: toSchema(child) })
      .evolve('v2', { count: Schema.Number }, (previous) => ({
        ...previous,
        count: 0,
      }))
      .build();
    const snapshot = Snapshot.capture(parent);

    expect(sha256(JSON.stringify(snapshot))).toBe(
      'c02b09257a6dc722fd06a860d82e719807e8ad4b7c806ab6820e6574b4b6e1e2',
    );
    expect(sha256(Snapshot.render(snapshot))).toBe(
      'a29fafa982a7005005326721325ad8c81d54473ea5bd540b0c5c38a9e450e755',
    );
  });
});
