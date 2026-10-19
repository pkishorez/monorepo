import { describe, expect, it } from 'vitest';
import { opened, principalAt, senderOf, sentBy } from './caller.ts';

const member = { userId: 'u-ada', email: 'ada@demo', name: 'Ada' };
const HOUR = 60 * 60 * 1000;

describe('a User Space’s caller', () => {
  it('is what the Worker said, whatever the browser sent', () => {
    const forged = new Request('https://x/', {
      headers: {
        'x-console-caller': JSON.stringify({
          member: { ...member, userId: 'u-eve' },
          until: 1,
        }),
      },
    });
    const sent = sentBy(forged, { member, until: 5, at: 0 });
    expect(senderOf(Object.fromEntries(sent.headers))).toEqual({
      member,
      until: 5,
      at: 0,
    });
  });

  it('is nobody when the Worker said nothing', () => {
    expect(senderOf({})).toBeNull();
    expect(senderOf({ 'x-console-caller': '{"member":1}' })).toBeNull();
  });

  it('acts on a socket until its session ends, an hour at most', () => {
    expect(opened({ member, until: 10 * HOUR, at: 0 }, 0).until).toBe(HOUR);
    expect(opened({ member, until: 1000, at: 0 }, 0).until).toBe(1000);
  });

  it('is nobody once their time is up', () => {
    expect(principalAt({ member, until: 1000, at: 0 }, 999)?.user.id).toBe(
      'u-ada',
    );
    expect(principalAt({ member, until: 1000, at: 0 }, 1000)).toBeNull();
    expect(principalAt(null, 0)).toBeNull();
  });
});
