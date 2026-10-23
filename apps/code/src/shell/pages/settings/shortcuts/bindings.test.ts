import { describe, expect, it } from 'vitest';
import { keys } from '../../../../keys.ts';
import {
  assign,
  clashOf,
  groups,
  keysOf,
  reset,
  search,
  shadowsOf,
  swapped,
} from './bindings.ts';

/*
 * The user's keys as Settings changes them, on the app's own definition:
 * every Action is listed by its Surface, a recorded key keeps an Action's
 * Sequences, a key another Action on the Surface has is a Clash that Swap
 * settles, and a key a nearer Surface has is only a note.
 */

describe('Shortcut bindings', () => {
  it('lists every Action of the definition, grouped by its Surface', () => {
    const listed = groups.flatMap((group) => group.actions.map(({ id }) => id));
    expect(keys.checkBindings({}).invalid).toEqual([]);
    expect(listed).toContain('app.settings');
    expect(listed).toContain('picker.finish');
    expect(groups.find(({ surface }) => surface === 'content')?.name).toBe(
      'page',
    );
    // A Surface with no Actions, such as the help sheet, is not listed.
    expect(groups.map(({ surface }) => surface)).not.toContain('help');
  });

  it('records one Shortcut in place of the others, keeping Sequences', () => {
    const next = assign({}, 'picker.back', 'ctrl+g');
    expect(keysOf(next, 'picker.back')).toEqual(['ctrl+g']);
    expect(keysOf(reset(next, 'picker.back').bindings, 'picker.back')).toEqual([
      'ctrl+h',
      'Backspace',
    ]);
    const kept = assign(
      { 'app.side': ['ctrl+h', 'Space x'] },
      'app.side',
      'ctrl+g',
    );
    expect(keysOf(kept, 'app.side')).toEqual(['ctrl+g', 'Space x']);
    const first = groups
      .flatMap((group) => group.actions)
      .find(({ id }) => id === 'sidebar.first');
    expect(first?.recordable).toBe(false);
  });

  it('resets with an Action every one whose keys its defaults would take, after Swaps', () => {
    // Projects to S, swapping with Sessions; then Sessions to A, swapping
    // with Actions, which ends on O.
    let bindings = assign({}, 'app.projects', 's');
    bindings = swapped({}, clashOf(bindings, 'app.projects')!)!;
    const next = assign(bindings, 'app.sessions', 'a');
    bindings = swapped(bindings, clashOf(next, 'app.sessions')!)!;
    expect(bindings).toEqual({
      'app.projects': ['s'],
      'app.sessions': ['a'],
      'app.actions': ['o'],
    });
    expect(keys.checkBindings(bindings).conflicts).toEqual([]);

    // O back on Projects takes Actions back to A, and so Sessions.
    const after = reset(bindings, 'app.projects');
    expect(after).toEqual({
      bindings: {},
      also: ['app.actions', 'app.sessions'],
    });
    // One whose defaults no one has goes back alone.
    expect(reset({ 'content.up': ['ctrl+y'] }, 'content.up')).toEqual({
      bindings: {},
      also: [],
    });
  });

  it('finds a Clash on the same Surface, and Swap exchanges the keys', () => {
    const next = assign({}, 'content.up', 'j');
    const clash = clashOf(next, 'content.up');
    expect(clash).toEqual({
      id: 'content.up',
      keys: 'j',
      holder: 'content.down',
    });
    const swap = swapped({}, clash!);
    expect(swap).toEqual({ 'content.up': ['j'], 'content.down': ['k'] });
    expect(clashOf(swap!, 'content.up')).toBeNull();
  });

  it('allows a key a nearer Surface has, with a note', () => {
    const next = assign({}, 'app.page', 'i');
    expect(clashOf(next, 'app.page')).toBeNull();
    expect(shadowsOf(next).get('app.page')).toEqual({
      by: 'content.write',
      keys: 'i',
    });
  });

  it('searches the table by section, row, label and keys', () => {
    const labels = (query: string) =>
      search({}, query).flatMap(({ rows }) => rows.map(({ label }) => label));
    expect(labels('picker done')).toEqual(['Done, on the row highlighted']);
    expect(labels('ctrl+d')).toEqual(['Scroll the page']);
    expect(labels('ctrl+p')).toEqual(['Open a project', 'Next, previous row']);
  });
});
