import { describe, expect, it } from 'vitest';
import { AuthorizationClientError } from '../../client/index.js';
import { needsReauthentication } from '../user-access.js';

describe('needsReauthentication', () => {
  it('only recognizes Better Auth stale-session failures', () => {
    expect(
      needsReauthentication(
        new AuthorizationClientError(
          'Session is not fresh',
          'SESSION_NOT_FRESH',
        ),
      ),
    ).toBe(true);
    expect(
      needsReauthentication(
        new AuthorizationClientError('Service unavailable', undefined),
      ),
    ).toBe(false);
  });
});
