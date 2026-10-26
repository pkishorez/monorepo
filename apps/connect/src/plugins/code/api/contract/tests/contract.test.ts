import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { versionedValuesOf } from '../../../../../cloud/contract/tests/versioned.js';
import { CodeApi } from '../index.js';

/*
 * The code Plugin's contract sends every value as an ESchema, so Code reads
 * a Connection that lags behind it, and each ESchema reads every version it
 * ever stored.
 */

const { problems, eschemas } = versionedValuesOf(CodeApi);

describe('code Plugin contract', () => {
  it('sends every payload, success and item as an ESchema', () => {
    expect(problems).toEqual([]);
  });

  it.each(eschemas.map((each) => [each.name, each] as const))(
    '%s reads every version it stored',
    async (_, eschema) => {
      await expectUpgradable(eschema);
    },
  );
});
