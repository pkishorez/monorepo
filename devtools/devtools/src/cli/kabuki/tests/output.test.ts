import { describe, expect, test } from 'vitest';
import type { Changes, Entry, History } from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import {
  renderChangesText,
  renderHistoryText,
  renderSessionsText,
  renderSnapshotText,
  sessionsTree,
} from '../text.js';

const wrote: Entry = {
  id: 1,
  parent: null,
  destination: 'Diary',
  message: { _tag: 'Wrote', note: { text: 'first' } },
  tag: 'Wrote',
  source: { kind: 'view', instance: 'Diary' },
  at: 1_000,
  outcome: 'handled',
};

const bumped: Entry = {
  id: 2,
  parent: 1,
  destination: 'Diary/counter',
  message: { _tag: 'Bumped' },
  tag: 'Bumped',
  source: { kind: 'worker', instance: 'Diary', name: 'tick', key: 'a' },
  at: 2_000,
  outcome: 'ignored',
};

describe('kabuki output', () => {
  test('lists Kabuki Sessions as a tree: app, Environment, one row each', () => {
    const session = (
      name: string,
      app: string,
      environment: string,
      url: string,
    ): KabukiSessionSummary => ({
      name,
      app,
      environment,
      url,
      origin: null,
      connectedAt: 0,
    });
    const tree = sessionsTree([
      session('swift-seal', 'connect', 'kishores-mbp', ''),
      session(
        'calm-heron',
        'code',
        'app.trycloudflare.com',
        'https://app.trycloudflare.com/',
      ),
      session(
        'quiet-otter',
        'code',
        'localhost:5173',
        'http://localhost:5173/notes',
      ),
      session('lynx', 'code', 'localhost:5173', 'http://localhost:5173/'),
    ]);
    expect(tree.apps.map(({ app }) => app)).toEqual(['code', 'connect']);
    expect(renderSessionsText(tree)).toBe(
      [
        'code',
        '  localhost:5173',
        '    quiet-otter  /notes  connected 1970-01-01T00:00:00.000Z',
        '    lynx         /  connected 1970-01-01T00:00:00.000Z',
        '  app.trycloudflare.com',
        '    calm-heron  /  connected 1970-01-01T00:00:00.000Z',
        'connect',
        '  kishores-mbp',
        '    swift-seal  (no page)  connected 1970-01-01T00:00:00.000Z',
      ].join('\n'),
    );
    expect(renderSessionsText(sessionsTree([]))).toContain('No Kabuki Session');
  });

  test('renders a History as one line per entry', () => {
    const history: History = {
      entries: [wrote, bumped],
      head: 2,
      size: 2,
      shown: null,
      running: true,
      failure: null,
    };
    expect(renderHistoryText(history)).toMatchInlineSnapshot(`
      "head #2 · 2 entries kept · live · running
      #1  Wrote  → Diary  from view Diary  handled  at 1.00s
      #2  Bumped  → Diary/counter  from worker Diary/tick#a  ignored  at 2.00s"
    `);
  });

  test("renders a Step's changes, each value as compact JSON", () => {
    const changes: Changes = {
      entry: wrote,
      commands: ['save'],
      changes: [
        {
          instance: 'Diary',
          kind: 'changed',
          actor: 'Diary',
          state: ['Idle', 'Saving'],
          model: [{ path: 'notes.0', to: { text: 'first' } }],
          props: [],
          started: ['save'],
          stopped: [],
        },
      ],
    };
    expect(renderChangesText(changes)).toMatchInlineSnapshot(`
      "#1  Wrote  → Diary  from view Diary  handled  at 1.00s
      message {"_tag":"Wrote","note":{"text":"first"}}
      commands save
      ~ Diary (Diary)
          state Idle → Saving
          model notes.0: (none) → {"text":"first"}
          started save"
    `);
  });

  test('renders a Snapshot under where it was read', () => {
    expect(
      renderSnapshotText({
        at: 'init',
        path: 'model.notes',
        value: [],
        summarized: true,
      }),
    ).toBe(
      'at init · path model.notes · summarized: pass --expand for all of it\n[]',
    );
  });
});
