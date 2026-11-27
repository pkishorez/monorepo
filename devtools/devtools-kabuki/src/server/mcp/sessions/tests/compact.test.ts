import { describe, expect, it } from 'vitest';
import type { Node } from '../../../rpc/session/contract/index.ts';
import { trimmed } from '../../../rpc/contract/index.ts';
import { treeOf } from '../real/look.ts';
import { addressOf, namesOf } from '../real/names.ts';
import { named, signature } from '../real/signature.ts';
import { brief } from '../real/text.ts';

describe('signature', () => {
  it('writes a Shape as one line of TypeScript', () => {
    expect(
      signature({
        kind: 'struct',
        fields: [
          {
            name: 'email',
            optional: false,
            nullable: false,
            shape: { kind: 'text' },
          },
          {
            name: 'age',
            optional: true,
            nullable: true,
            shape: { kind: 'number' },
          },
          {
            name: 'mode',
            optional: false,
            nullable: false,
            shape: { kind: 'choice', options: ['Message', 'Btw'] },
          },
          {
            name: 'tags',
            optional: false,
            nullable: false,
            shape: { kind: 'array', of: { kind: 'choice', options: [1, 2] } },
          },
          {
            name: 'what',
            optional: false,
            nullable: false,
            shape: { kind: 'json', text: '{ _tag, text }' },
          },
        ],
      }),
    ).toBe(
      '{ email: string; age?: number | null; mode: "Message" | "Btw"; tags: (1 | 2)[]; what: { _tag, text } }',
    );
  });

  it('names a Message or Control, with its description when it has one', () => {
    expect(
      named({ name: 'Cancel', shape: { kind: 'struct', fields: [] } }),
    ).toBe('Cancel {}');
    expect(
      named({
        name: 'Bumped',
        shape: { kind: 'struct', fields: [] },
        description: 'One more',
      }),
    ).toBe('Bumped {}  // One more');
  });
});

const node = (
  address: string,
  actor: string,
  state: string,
  children: ReadonlyArray<Node> = [],
  key?: string,
): Node => ({
  address,
  actor,
  slot: null,
  ...(key === undefined ? {} : { key }),
  state,
  data: {},
  model: {},
  workers: [],
  provides: [],
  children,
});

const app = (signedIn: boolean) =>
  node('Router', 'Router', 'Single', [
    node(
      'Router/page#1',
      'App',
      signedIn ? 'SignedIn' : 'SignedOut',
      signedIn
        ? [
            node('Router/page#1/Home[%5B%5D]#1', 'Home', 'Single', [
              node('h/projects[c1]#1', 'Projects', 'Single', [], 'c1'),
            ]),
            node('Router/page#1/sidebar#1', 'Sidebar', 'Single', [
              node('s/projects[c1]#1', 'Projects', 'Single', [], 'c1'),
              node('s/projects[c2]#1', 'Projects', 'Single', [], 'c2'),
            ]),
            node(
              'Router/page#1/Account[%5B%22a%22%5D]#1',
              'Account',
              'Active',
              [],
              '["a"]',
            ),
          ]
        : [],
    ),
  ]);

describe('names', () => {
  it('names an instance by its Actor, its key, or its parent, whichever is alone', () => {
    expect(treeOf(app(true), {}).lines).toEqual([
      'Router',
      '  App [SignedIn]',
      '    Home',
      '      Home/Projects[c1]',
      '    Sidebar',
      '      Sidebar/Projects[c1]',
      '      Projects[c2]',
      '    Account [Active]',
    ]);
  });

  it('finds an address by its name or by itself', () => {
    const names = namesOf(app(true));
    expect(addressOf(names, 'Sidebar/Projects[c1]')).toBe('s/projects[c1]#1');
    expect(addressOf(names, 'Router/page#1')).toBe('Router/page#1');
    expect(addressOf(names, 'Projects')).toBeUndefined();
  });

  it('finds an instance by its Actor or child key in any case, when only one has it', () => {
    const names = namesOf(app(true));
    expect(addressOf(names, 'sidebar')).toBe('Router/page#1/sidebar#1');
    expect(addressOf(names, 'projects')).toBeUndefined();
  });
});

describe('trimmed', () => {
  it('cuts long text, keeps the ends of a long list and the first keys', () => {
    expect(trimmed('x'.repeat(200))).toBe(`${'x'.repeat(160)}…(200 chars)`);
    expect(trimmed(Array.from({ length: 15 }, (_, at) => at))).toEqual([
      0,
      1,
      2,
      3,
      '…3 more',
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
    ]);
    const wide = Object.fromEntries(
      Array.from({ length: 18 }, (_, at) => [`k${at}`, at]),
    );
    expect(Object.keys(trimmed(wide) as object)).toHaveLength(17);
  });
});

describe('brief', () => {
  it('writes a Model on one line, whole when it fits', () => {
    expect(brief({ url: 'https://t.example.com', reachable: true })).toEqual({
      text: '{ url: https://t.example.com, reachable: true }',
      cut: false,
    });
  });

  it('folds a long field and stops at the width, saying how many are left', () => {
    const model = {
      notes: Array.from({ length: 30 }, (_, at) => ({ at, text: `n ${at}` })),
      user: { id: 1, name: 'Ada Lovelace', roles: ['admin', 'owner'] },
      email: 'ada@x.io',
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, at) => [`flag${at}`, true]),
      ),
    };
    expect(brief(model)).toEqual({
      text: '{ notes: […30], user: {…3}, email: ada@x.io, flag0: true, flag1: true, … 4 more }',
      cut: true,
    });
    expect(brief('x'.repeat(100), 10)).toEqual({
      text: `${'x'.repeat(10)}…`,
      cut: true,
    });
  });
});
