import { describe, expect, it } from 'vitest';
import type {
  Entry,
  Looked,
  Watched,
} from '../../../rpc/session/contract/index.ts';
import { addressOf, changesOf, namesOf, treeOf } from '../real/names.ts';
import { named, signature } from '../real/signature.ts';
import { timelineOf } from '../real/timeline.ts';
import { changedOf, trimmed } from '../real/trim.ts';

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

const entry = (id: number, from: Entry['from'], to = 'App'): Entry => ({
  id,
  parent: null,
  to,
  tag: `T${id}`,
  from,
  at: id,
  outcome: 'handled',
});

const watched = (count: number): Watched => ({
  now: {
    head: count,
    seeking: null,
    running: true,
    failure: null,
    url: 'http://app.test/',
    revision: 3,
  },
  entries: Array.from({ length: count }, (_, i) =>
    entry(i + 1, { kind: 'view', instance: 'App' }),
  ),
});

describe('timelineOf', () => {
  it('keeps the last 10 entries, or the 10 before an id', () => {
    expect(timelineOf(watched(25)).last.map(({ id }) => id)).toEqual([
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    ]);
    expect(timelineOf(watched(25), 8).last.map(({ id }) => id)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(timelineOf(watched(25)).now).toEqual({
      head: 25,
      seeking: null,
      failure: null,
      url: 'http://app.test/',
    });
  });

  it('says where each Message came from in a few words, naming another instance', () => {
    const { last } = timelineOf({
      ...watched(0),
      entries: [
        entry(1, { kind: 'view', instance: 'App' }),
        entry(2, { kind: 'command', instance: 'App', name: 'SignIn' }),
        entry(3, {
          kind: 'worker',
          instance: 'App/page',
          name: 'known',
          key: 'a',
        }),
        entry(4, { kind: 'outside', name: 'devtools' }),
        entry(5, { kind: 'outside' }),
      ],
    });
    expect(last.map(({ from }) => from)).toEqual([
      'view',
      'command SignIn',
      'worker known a of App/page',
      'devtools',
      'outside',
    ]);
  });
});

const node = (
  address: string,
  actor: string,
  state: string,
  children: ReadonlyArray<Looked> = [],
  key?: string,
): Looked => ({
  address,
  place: actor,
  actor,
  slot: null,
  ...(key === undefined ? {} : { key }),
  state,
  change: null,
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
    expect(treeOf(namesOf(app(true)))).toEqual([
      'Router',
      ' App [SignedIn]',
      '  Home',
      '   Home/Projects[c1]',
      '  Sidebar',
      '   Sidebar/Projects[c1]',
      '   Projects[c2]',
      '  Account [Active]',
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

  it('says which instances came, went or changed State', () => {
    expect(changesOf(namesOf(app(false)), namesOf(app(true)))).toEqual([
      'App SignedOut → SignedIn',
      '+ Home',
      '+ Home/Projects[c1]',
      '+ Sidebar',
      '+ Sidebar/Projects[c1]',
      '+ Projects[c2]',
      '+ Account [Active]',
    ]);
    expect(changesOf(namesOf(app(true)), namesOf(app(false)))).toEqual([
      'App SignedIn → SignedOut',
      '- Home',
      '- Sidebar',
      '- Account',
    ]);
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

  it('gives the fields a change set, or nothing', () => {
    expect(changedOf({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
    expect(changedOf({ a: 1 }, { a: 1 })).toBeUndefined();
  });
});
