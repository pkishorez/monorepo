import type { HarnessInfo } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import { empty, fresh, shared, unread, update, wants } from '../store.ts';

/*
 * The catalog as its keeper keeps it: each agent's Harness Accounts
 * together, in the order the Connection first names the agents, the Default
 * Account first; the Skills kept shown at once, asked once the agents are
 * known and again when another agent can run; Retry asks again what
 * failed; and an agent that cannot run says why its models and Skills are
 * never read.
 */

const agent = (
  account: string,
  harness: HarnessInfo['harness'],
  name: string,
  available = true,
): HarnessInfo => ({
  account,
  harness,
  name,
  settings: [],
  defaultModel: 'default',
  available,
  unavailableReason: available ? null : `${name} is not installed`,
});

const setup = (harnesses: ReadonlyArray<HarnessInfo> | null) => ({
  _tag: 'SetupKnown' as const,
  harnesses,
  problem: null,
  models: [],
});

const skills = (account: string, problem: string | null = null) => ({
  account,
  list: problem === null ? [{ name: 'review', description: '' }] : [],
  problem,
});

describe('Catalog agents', () => {
  it("keeps each agent's accounts together, its Default Account first", () => {
    const { keeper } = update(
      fresh,
      setup([
        agent('claude-work', 'claude', 'Claude work'),
        agent('codex', 'codex', 'Codex'),
        agent('claude', 'claude', 'Claude'),
        agent('codex-work', 'codex', 'Codex work'),
      ]),
    );
    expect(shared(keeper).harnesses?.map(({ name }) => name)).toEqual([
      'Claude',
      'Claude work',
      'Codex',
      'Codex work',
    ]);
  });

  it('says why an agent that cannot run has no models or Skills, rather than loading them', () => {
    const catalog = {
      ...empty,
      harnesses: [
        agent('claude', 'claude', 'Claude'),
        agent('codex', 'codex', 'Codex', false),
      ],
    };
    expect(unread(empty, 'codex')).toBeNull();
    expect(unread(catalog, 'claude')).toBeNull();
    expect(unread(catalog, 'codex')).toBe('Codex is not installed');
    expect(unread(catalog, 'gone')).toBe(
      'This Connection has no Harness Account gone',
    );
  });
});

describe('Catalog Skills', () => {
  it('shows the kept Skills at once, and asks once the agents are known', () => {
    let { keeper } = update(fresh, {
      _tag: 'SkillsSaved',
      accountId: 'a1',
      skills: [skills('claude')],
    });
    expect(shared(keeper).skills).toEqual([skills('claude')]);
    expect(wants(keeper)).toEqual([]);
    ({ keeper } = update(keeper, setup([agent('claude', 'claude', 'Claude')])));
    expect(wants(keeper)).toEqual(['1']);
    const answered = update(keeper, {
      _tag: 'SkillsAnswered',
      since: 1,
      skills: [skills('claude')],
    });
    expect(answered.keep).toEqual([skills('claude')]);
    expect(wants(answered.keeper)).toEqual([]);
  });

  it('asks again when another agent can run, and drops the answer asked before', () => {
    let { keeper } = update(fresh, {
      _tag: 'SkillsSaved',
      accountId: 'a1',
      skills: null,
    });
    ({ keeper } = update(keeper, setup([agent('claude', 'claude', 'Claude')])));
    ({ keeper } = update(
      keeper,
      setup([
        agent('claude', 'claude', 'Claude'),
        agent('claude-qa', 'claude', 'QA setup'),
      ]),
    ));
    expect(wants(keeper)).toEqual(['2']);
    const late = update(keeper, {
      _tag: 'SkillsAnswered',
      since: 1,
      skills: [skills('claude')],
    });
    expect(late.keep).toBeNull();
    expect(late.keeper).toBe(keeper);
  });

  it('keeps what showed of an agent whose Skills are refused, and asks again on Retry', () => {
    let { keeper } = update(fresh, {
      _tag: 'SkillsSaved',
      accountId: 'a1',
      skills: [skills('claude')],
    });
    ({ keeper } = update(
      keeper,
      setup([
        agent('claude', 'claude', 'Claude'),
        agent('codex', 'codex', 'Codex'),
      ]),
    ));
    const answered = update(keeper, {
      _tag: 'SkillsAnswered',
      since: 1,
      skills: [skills('claude', 'busy'), skills('codex', 'busy')],
    });
    expect(shared(answered.keeper).skills).toEqual([
      skills('claude'),
      skills('codex', 'busy'),
    ]);
    expect(answered.keep).toEqual([skills('claude')]);
    const retried = update(answered.keeper, { _tag: 'Retry' });
    expect(wants(retried.keeper)).toEqual(['2']);
    expect(retried.refresh).toBe(false);
  });

  it('asks the setup again on Retry when it could not be asked', () => {
    const { keeper } = update(fresh, {
      _tag: 'SetupKnown',
      harnesses: null,
      problem: 'The Connection could not be reached',
      models: [],
    });
    expect(update(keeper, { _tag: 'Retry' }).refresh).toBe(true);
  });
});
