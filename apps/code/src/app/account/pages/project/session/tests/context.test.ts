import { describe, expect, it } from 'vitest';
import { contextRead } from '../actor.ts';

/* What the page keeps of its context as its agent is asked. */

describe('contextRead', () => {
  const reading = { usedTokens: 1000, maxTokens: 200000, rateLimits: [] };
  const page = { context: null, contextAsked: false, contextProblem: null };

  it('says it asked, so the way to fetch can show, when the agent is closed', () => {
    expect(contextRead(page, null)).toEqual({ ...page, contextAsked: true });
  });

  it('keeps a reading fetched with the agent closed when asked again', () => {
    const fetched = { ...page, context: reading, contextAsked: true };
    expect(contextRead(fetched, null).context).toEqual(reading);
  });

  it("takes the agent's reading, and forgets why a fetch failed", () => {
    const failed = { ...page, contextProblem: 'No such folder' };
    expect(contextRead(failed, reading)).toEqual({
      context: reading,
      contextAsked: true,
      contextProblem: null,
    });
  });

  it('keeps why a fetch failed while the agent has nothing to say', () => {
    const failed = { ...page, contextProblem: 'No such folder' };
    expect(contextRead(failed, null).contextProblem).toBe('No such folder');
  });
});
