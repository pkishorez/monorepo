import type { HarnessInfo } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import * as Catalog from '../../../store.ts';
import type { Model, Props } from '../../actor.ts';
import { firstStep, skillsOf } from '../pick.ts';

/*
 * The Skills a Session's Draft offers: loading while its agent's are read,
 * and, for an agent that cannot run on the Connection, or that the Connection no
 * longer has, why, never loading for ever.
 */

const agent = (account: string, available: boolean): HarnessInfo => ({
  account,
  harness: 'claude',
  name: account,
  settings: [],
  defaultModel: 'opus',
  available,
  unavailableReason: available ? null : 'Claude is not installed',
});

const draft = (catalog: typeof Catalog.Catalog.Type) =>
  ({
    catalog,
    chosen: { account: null, model: null, settings: {} },
  }) as unknown as Model;

const session = (account: string): Props => ({
  connectionId: 'm1',
  projectId: 'p1',
  to: {
    _tag: 'Session',
    sessionId: 's1',
    agent: { account, model: 'opus', settings: {} },
    running: false,
  },
});

const catalog = {
  ...Catalog.empty,
  harnesses: [agent('claude', true), agent('claude-work', false)],
};

describe('a Session’s Skills', () => {
  it('load while its agent’s are read', () => {
    expect(skillsOf(draft(catalog), session('claude'))).toMatchObject({
      loading: true,
      problem: null,
    });
  });

  it('say why, never loading, when its agent cannot run here', () => {
    expect(skillsOf(draft(catalog), session('claude-work'))).toMatchObject({
      loading: false,
      problem: 'Claude is not installed',
    });
  });

  it('say why, never loading, when the Connection no longer has its agent', () => {
    expect(skillsOf(draft(catalog), session('gone'))).toMatchObject({
      loading: false,
      problem: 'This Connection has no Harness Account gone',
    });
  });
});

describe('a new session’s first step', () => {
  const git = {
    _tag: 'Git' as const,
    current: 'main',
    worktrees: [
      { path: '/code/app', branch: 'main' },
      { path: '/data/w/01x', branch: 'fix' },
    ],
    local: [
      { name: 'main', upstream: 'origin/main', worktree: '/code/app' },
      { name: 'fix', upstream: null, worktree: '/data/w/01x' },
      { name: 'spike', upstream: 'origin/spike', worktree: null },
    ],
    origin: ['origin/release'],
  };
  const of = (
    branches: Model['branches'],
    branch: string | null,
    newWorktree = false,
  ) => firstStep({ branches } as Model, { branch, newWorktree });

  it('is making the Worktree when one is asked for', () => {
    expect(of(git, 'main', true)).toBe('makingWorktree');
    expect(of(null, null, true)).toBe('makingWorktree');
  });

  it('is switching the branch only to one no Worktree has out', () => {
    expect(of(git, 'spike')).toBe('switchingBranch');
    expect(of(git, 'origin/release')).toBe('switchingBranch');
    expect(of(git, 'origin/spike')).toBe('switchingBranch');
    expect(of(git, 'main')).toBe('startingAgent');
    expect(of(git, 'fix')).toBe('startingAgent');
  });

  it('is starting the agent where no git step runs', () => {
    expect(of({ _tag: 'NotGit' }, null)).toBe('startingAgent');
    expect(of(null, null)).toBe('startingAgent');
    expect(of(null, 'spike')).toBe('switchingBranch');
  });
});
