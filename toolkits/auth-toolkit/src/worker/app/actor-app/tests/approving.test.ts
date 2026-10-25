import { describe, expect, it } from 'vitest';
import { approving } from '../approving/approving.ts';

const ada = { id: 'a', email: 'ada@acme.dev', name: 'Ada', image: null };
const grace = { id: 'g', email: 'grace@acme.dev', name: 'Grace', image: null };
const both = { accounts: [ada, grace], active: 'g', chosen: null };

describe('approving', () => {
  it('is the Active Account with nothing picked or hinted', () => {
    expect(approving(both)).toEqual({ chosen: grace, missing: undefined });
  });

  it('prefers the hinted Account, in any case, over the Active one', () => {
    expect(approving(both, 'ADA@acme.dev').chosen).toBe(ada);
  });

  it('prefers the Account picked over the hint', () => {
    expect(approving({ ...both, chosen: 'g' }, 'ada@acme.dev').chosen).toBe(
      grace,
    );
  });

  it('names a hinted Account that is not signed in here', () => {
    expect(approving(both, 'linus@acme.dev')).toEqual({
      chosen: grace,
      missing: 'linus@acme.dev',
    });
  });

  it('stops naming it once another was chosen instead', () => {
    expect(
      approving({ ...both, overrode: true }, 'linus@acme.dev').missing,
    ).toBeUndefined();
  });
});
