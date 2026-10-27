import { describe, expect, it } from 'vitest';
import { placeIn, readyOf } from '../actor.ts';

/*
 * When a project's page can be drawn whole: its row read from this device
 * and, for a row held here, its new session's Saved Draft read back, so
 * the words and the Draft come in one step; with a Session open, as that
 * Session says; a Machine off the Account's list at once, as nothing of it
 * is read here. Its Machine answering is never waited for.
 */

const held = { status: 'ready' as const, held: true };

describe('a project, ready', () => {
  it('waits for its row', () => {
    expect(
      readyOf({
        unlisted: false,
        found: undefined,
        session: undefined,
        restored: true,
      }),
    ).toBe(false);
    expect(
      readyOf({
        unlisted: false,
        found: { status: 'loading', held: false },
        session: undefined,
        restored: true,
      }),
    ).toBe(false);
  });

  it('waits for the new session’s Saved Draft, so the Draft comes with the words', () => {
    expect(
      readyOf({
        unlisted: false,
        found: held,
        session: undefined,
        restored: false,
      }),
    ).toBe(false);
    expect(
      readyOf({
        unlisted: false,
        found: held,
        session: undefined,
        restored: undefined,
      }),
    ).toBe(false);
    expect(
      readyOf({
        unlisted: false,
        found: held,
        session: undefined,
        restored: true,
      }),
    ).toBe(true);
  });

  it('draws a row not held here as it is, never waiting for its Machine', () => {
    expect(
      readyOf({
        unlisted: false,
        found: { status: 'ready', held: false },
        session: undefined,
        restored: false,
      }),
    ).toBe(true);
  });

  it('is as ready as the Session open', () => {
    expect(
      readyOf({
        unlisted: false,
        found: undefined,
        session: false,
        restored: undefined,
      }),
    ).toBe(false);
    expect(
      readyOf({
        unlisted: false,
        found: undefined,
        session: true,
        restored: undefined,
      }),
    ).toBe(true);
  });

  it('is ready at once on a Machine off the Account’s list', () => {
    expect(
      readyOf({
        unlisted: true,
        found: undefined,
        session: false,
        restored: undefined,
      }),
    ).toBe(true);
  });
});

describe('a place in a project', () => {
  it('is the Session open, or empty for a new session', () => {
    expect(placeIn(undefined)).toBe('');
    expect(placeIn({ sessionId: 's1' })).toBe('s1');
  });
});
