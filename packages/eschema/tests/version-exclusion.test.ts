import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema } from '../src/eschema.js';

describe('version Exclusion in ESchema', () => {
  it('should allow unique version names to work correctly', () => {
    const mockSchema1 = Schema.Struct({ value: Schema.String });
    const mockSchema2 = Schema.Struct({ count: Schema.Number });

    const builder = ESchema.make('v1', mockSchema1);

    // This should work fine - unique versions
    const evolved = builder.evolve('v2', mockSchema2, () => ({ count: 42, __v: 'v2' as const }));
    const evolved2 = evolved.evolve('v3', mockSchema1, () => ({ value: 'hello', __v: 'v3' as const }));
    const evolved3 = evolved2.evolve('v4', mockSchema2, () => ({ count: 123, __v: 'v4' as const }));

    // Verify the builder chain works
    expect(evolved).toBeDefined();
    expect(evolved2).toBeDefined();
    expect(evolved3).toBeDefined();
  });
});

