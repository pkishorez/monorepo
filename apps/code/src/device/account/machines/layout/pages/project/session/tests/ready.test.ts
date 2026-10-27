import { describe, expect, it } from 'vitest';
import { readyOf } from '../actor.ts';

/*
 * When a session's page can be drawn whole, its transcript and its Draft
 * in one step: its row and messages read from this device and, for a row
 * held here, the page's read of it, every session it carries on from,
 * and its Saved Draft read back. A row not held here is drawn as it is,
 * missing or waiting; its Machine answering is never waited for.
 */

const row = {
  id: 's1',
  projectId: 'p1',
  account: 'claude',
  model: 'opus',
  settings: {},
  running: false,
  forkedFrom: null,
  endedAt: null,
};
const ready = { status: 'ready' as const };
const loading = { status: 'loading' as const };
const whole = {
  sessionId: 's1',
  model: { row, lineage: [] },
  found: { status: 'ready' as const, held: true },
  messages: ready,
  earlier: [],
  restored: true,
};

describe('a session, ready', () => {
  it('is ready once all of it is read from this device', () => {
    expect(readyOf(whole)).toBe(true);
  });

  it('waits for its row and its messages', () => {
    expect(readyOf({ ...whole, found: undefined })).toBe(false);
    expect(
      readyOf({ ...whole, found: { status: 'loading', held: false } }),
    ).toBe(false);
    expect(readyOf({ ...whole, messages: undefined })).toBe(false);
    expect(readyOf({ ...whole, messages: loading })).toBe(false);
  });

  it('waits for its Saved Draft, so the Draft comes with the transcript', () => {
    expect(readyOf({ ...whole, restored: false })).toBe(false);
    expect(readyOf({ ...whole, restored: undefined })).toBe(false);
  });

  it('waits for the page’s read of this session’s row, not the last one’s', () => {
    expect(readyOf({ ...whole, model: { row: null, lineage: [] } })).toBe(
      false,
    );
    expect(
      readyOf({ ...whole, model: { row: { ...row, id: 's0' }, lineage: [] } }),
    ).toBe(false);
  });

  it('waits for each session a fork carries on from', () => {
    const forked = {
      ...whole,
      model: {
        row: { ...row, forkedFrom: { sessionId: 's0', turnId: 't1' } },
        lineage: [{ id: 's0', title: 'First', forkedFrom: null }],
      },
    };
    expect(readyOf({ ...forked, earlier: [] })).toBe(false);
    expect(readyOf({ ...forked, earlier: [loading] })).toBe(false);
    expect(readyOf({ ...forked, earlier: [ready] })).toBe(true);
  });

  it('draws a row not held here as it is, never waiting for its Machine', () => {
    expect(
      readyOf({
        ...whole,
        model: { row: null, lineage: [] },
        found: { status: 'ready', held: false },
        restored: false,
      }),
    ).toBe(true);
  });
});
