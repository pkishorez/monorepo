import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type * as Api from '../../../../api/index.ts';
import { Trail, pickOf } from './trail.tsx';

/*
 * One Instance's Trail drawn: a row per moment, oldest first, each a
 * button naming what it was and what it changed; the Step shown is the
 * current one. A moment picked asks for its Step, and for the card to open
 * unless the moment stopped the Instance.
 */

const entry = (id: number, to: string, tag: string): Api.Entry => ({
  id,
  parent: id === 1 ? null : id - 1,
  to,
  message: { _tag: tag },
  tag,
  from: { kind: 'view', instance: to },
  at: id * 100,
  outcome: 'handled',
});

const trail: Api.Trail = {
  instance: 'App/Inside:page#1',
  actor: 'Page',
  moments: [
    {
      entry: entry(1, 'App', 'Entered'),
      kind: 'started',
      model: [],
      props: [],
    },
    {
      entry: entry(2, 'App/Inside:page#1', 'Loaded'),
      kind: 'changed',
      state: ['Loading', 'Ready'],
      model: ['items'],
      props: [],
    },
    {
      entry: { ...entry(3, 'App/Inside:page#1', 'Poked'), outcome: 'ignored' },
      kind: 'received',
      model: [],
      props: [],
    },
    { entry: entry(4, 'App', 'Left'), kind: 'stopped', model: [], props: [] },
  ],
};

const draw = (at: Api.Step | null, told: Api.Trail | null = trail) =>
  renderToStaticMarkup(
    <Trail
      instance={trail.instance}
      trail={told}
      problem={null}
      at={at}
      onPick={() => {}}
      onClose={() => {}}
    />,
  );

describe("an Instance's Trail, drawn", () => {
  it('draws one button per moment, oldest first, each saying what it was and changed', () => {
    const html = draw(null);
    expect(html.match(/<li>/g)).toHaveLength(4);
    const kinds = [...html.matchAll(/>(started|changed|received|stopped)</g)];
    expect(kinds.map(([, kind]) => kind)).toEqual([
      'started',
      'changed',
      'received',
      'stopped',
    ]);
    expect(html).toContain('Entered → App');
    expect(html).toContain('Loading → Ready · model items');
    expect(html).toContain(' · no rule took it');
    expect(html).toContain('Trail of');
    expect(html).toContain('page#1');
    expect(html).toContain('aria-label="Back to the whole tree"');
    expect(html).not.toContain('aria-current');
  });

  it('marks the moment at the Step shown', () => {
    const html = draw(2);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Loaded/);
  });

  it('says it reads, then that no Instance had the Address', () => {
    expect(draw(null, null)).toContain('Reading its Trail');
    expect(draw(null, { ...trail, moments: [] })).toContain(
      'No Instance had this Address',
    );
  });

  it("asks for a moment's Step, and opens no card for the one that stopped it", () => {
    const [started, changed, , stopped] = trail.moments;
    expect(pickOf(started!)).toEqual({ step: 1, open: true });
    expect(pickOf(changed!)).toEqual({ step: 2, open: true });
    expect(pickOf(stopped!)).toEqual({ step: 4, open: false });
    expect(
      pickOf({ entry: null, kind: 'started', model: [], props: [] }),
    ).toEqual({ step: 'init', open: true });
  });
});
