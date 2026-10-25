import type { HarnessInfo } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import { changed, empty } from './catalog.ts';

/*
 * The agents as the catalog keeps them: each agent's Harness Accounts
 * together, in the order the server first names the agents, the Default
 * Account first, whatever order the server sends them in.
 */

const agent = (
  account: string,
  harness: HarnessInfo['harness'],
  name: string,
): HarnessInfo => ({
  account,
  harness,
  name,
  settings: [],
  defaultModel: 'default',
  available: true,
  unavailableReason: null,
});

describe('Catalog agents', () => {
  it("keeps each agent's accounts together, its Default Account first", () => {
    const { harnesses } = changed(empty, {
      _tag: 'HarnessesLoaded',
      harnesses: [
        agent('claude-work', 'claude', 'Claude work'),
        agent('codex', 'codex', 'Codex'),
        agent('claude', 'claude', 'Claude'),
        agent('codex-work', 'codex', 'Codex work'),
      ],
    });
    expect(harnesses?.map(({ name }) => name)).toEqual([
      'Claude',
      'Claude work',
      'Codex',
      'Codex work',
    ]);
  });
});
