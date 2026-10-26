import type { HarnessInfo } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import { Catalog } from '../../capabilities/index.ts';
import type { Model, Props } from '../actor.ts';
import { skillsOf } from './picks.ts';

/*
 * The Skills a Session's Draft offers: loading while its agent's are read,
 * and, for an agent that cannot run on the Machine, or that the Machine no
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
  machineId: 'm1',
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

  it('say why, never loading, when the Machine no longer has its agent', () => {
    expect(skillsOf(draft(catalog), session('gone'))).toMatchObject({
      loading: false,
      problem: 'This Machine has no Harness Account gone',
    });
  });
});
