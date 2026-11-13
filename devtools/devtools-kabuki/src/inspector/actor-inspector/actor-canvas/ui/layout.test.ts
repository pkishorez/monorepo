import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../../../api/index.ts';
import { providerOf } from './layout.ts';

/*
 * Who provides a Capability to a card: the nearest card above it that
 * Provides it where the way down is placed, its top or the State the Child
 * on the way lives in. Where the Child is placed says it, whether a State
 * is current or not, as in the Blueprint; none above, the app's Layer.
 */

type Level = GraphNode['blueprint']['top'];
const level = (provides: ReadonlyArray<string> = []): Level => ({
  on: [],
  workers: [],
  children: [],
  queries: [],
  provides,
});

const node = (
  id: string,
  options: {
    readonly top?: ReadonlyArray<string>;
    readonly states?: Readonly<Record<string, ReadonlyArray<string>>>;
    readonly within?: string;
    readonly state?: string;
    readonly requires?: ReadonlyArray<string>;
    readonly children?: ReadonlyArray<GraphNode>;
  } = {},
): GraphNode => ({
  id,
  title: id,
  actor: id,
  blueprint: {
    name: id,
    single: false,
    requires: options.requires ?? [],
    top: level(options.top),
    state: Object.fromEntries(
      Object.entries(options.states ?? {}).map(([tag, gives]) => [
        tag,
        level(gives),
      ]),
    ),
  },
  condition: null,
  keyed: false,
  within: options.within ?? null,
  state: options.state ?? null,
  workers: [],
  gone: [],
  children: options.children ?? [],
});

describe('who provides a Capability to a card', () => {
  it('is the parent that Provides it in the State the card is placed in, with no State current', () => {
    const root = node('App', {
      states: { Inside: ['Session'], SignedOut: [] },
      children: [node('home', { within: 'Inside', requires: ['Session'] })],
    });
    expect(providerOf(root, 'home', 'Session')).toBe('App');
  });

  it('is not a parent that Provides it only in another State', () => {
    const root = node('App', {
      state: 'SignedOut',
      states: { Inside: ['Session'], SignedOut: [] },
      children: [node('away', { within: 'SignedOut' })],
    });
    expect(providerOf(root, 'away', 'Session')).toBeUndefined();
  });

  it("reaches a Child at the top only from its parent's top", () => {
    const root = node('App', {
      state: 'Inside',
      top: ['Clock'],
      states: { Inside: ['Session'] },
      children: [node('bar')],
    });
    expect(providerOf(root, 'bar', 'Clock')).toBe('App');
    expect(providerOf(root, 'bar', 'Session')).toBeUndefined();
  });

  it('is the nearest above, past a parent that does not Provide it', () => {
    const root = node('App', {
      states: { Inside: ['Session'] },
      children: [
        node('downloads', {
          within: 'Inside',
          children: [node('files')],
        }),
      ],
    });
    expect(providerOf(root, 'files', 'Session')).toBe('App');
  });
});
