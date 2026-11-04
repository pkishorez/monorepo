import type { Definition } from '@kestack/use-keys/surfaces';
import { describe, expect, it } from 'vitest';
import { boundIn, keys, keyTable, worksWhileTyping } from '../commands.ts';

/*
 * The app's keys as the definition writes them: a plain key for each
 * Action of the page and the sidebar, in Vim Mode, a Ctrl key that works
 * in either Mode for what opens or moves, and only Settings, stopping the turn,
 * Ctrl+Space for a Dictation, paging, and the Ctrl moves between the
 * sidebar and the page, between sessions, and Back and Forward working
 * while typing, besides the Picker's own keys. A Dictation is never Escape's.
 */

const keysOf = (id: Parameters<typeof boundIn>[1]) => boundIn({}, id);

/** Every key of every Action, on every Surface. */
const keysIn = (surfaces: Definition): ReadonlyArray<string> =>
  Object.values(surfaces).flatMap((surface) => [
    ...Object.values(surface.actions ?? {}).flatMap(({ keys }) =>
      typeof keys === 'string' ? [keys] : keys,
    ),
    ...keysIn(surface.surfaces ?? {}),
  ]);

describe('keys', () => {
  it('gives each Action its single key', () => {
    expect({
      side: keysOf('app.side'),
      page: keysOf('app.page'),
      projects: keysOf('app.projects'),
      sessions: keysOf('app.sessions'),
      actions: keysOf('app.actions'),
      newSession: keysOf('app.newSession'),
      sidebar: keysOf('app.sidebar'),
      help: keysOf('app.help'),
      settings: keysOf('app.settings'),
      write: keysOf('content.write'),
      send: keysOf('content.send'),
      undo: keysOf('content.undo'),
      skills: keysOf('content.skills'),
      model: keysOf('content.model'),
      permissions: keysOf('content.permissions'),
      effort: keysOf('content.effort'),
      previousSession: keysOf('content.previousSession'),
      nextSession: keysOf('content.nextSession'),
      down: keysOf('content.down'),
      up: keysOf('content.up'),
      top: keysOf('content.top'),
      bottom: keysOf('content.bottom'),
      stop: keysOf('content.stop'),
      dictate: keysOf('app.dictate'),
      dictateAnywhere: keysOf('app.dictateAnywhere'),
      dictateInPicker: keysOf('picker.dictate'),
      microphone: keysOf('app.microphone'),
      sideAnywhere: keysOf('app.sideAnywhere'),
      pageAnywhere: keysOf('app.pageAnywhere'),
      previousSessionAnywhere: keysOf('app.previousSession'),
      nextSessionAnywhere: keysOf('app.nextSession'),
      back: keysOf('app.back'),
      forward: keysOf('app.forward'),
    }).toEqual({
      side: 'h',
      page: 'l',
      projects: 'o',
      sessions: 's',
      actions: 'a',
      newSession: 'n',
      sidebar: 'b',
      help: '?',
      settings: 'ctrl+,',
      write: 'i',
      send: 'Enter',
      undo: 'u',
      skills: '/',
      model: 'm',
      permissions: 'p',
      effort: 'e',
      previousSession: '[',
      nextSession: ']',
      down: 'j',
      up: 'k',
      top: 'g g',
      bottom: 'shift+g',
      stop: 'mod+.',
      dictate: 'Space',
      dictateAnywhere: 'ctrl+Space',
      dictateInPicker: 'ctrl+Space',
      microphone: 'd',
      sideAnywhere: 'ctrl+h',
      pageAnywhere: 'ctrl+l',
      previousSessionAnywhere: 'ctrl+[',
      nextSessionAnywhere: 'ctrl+]',
      back: 'ctrl+o',
      forward: 'ctrl+i',
    });
  });

  it('works while typing only for Settings, stopping, Ctrl+Space, paging, the Ctrl moves and the Picker', () => {
    const ids = [
      'app.side',
      'app.sideAnywhere',
      'app.pageAnywhere',
      'app.previousSession',
      'app.nextSession',
      'app.back',
      'app.forward',
      'app.projects',
      'app.dictate',
      'app.dictateAnywhere',
      'app.settings',
      'content.write',
      'content.send',
      'content.model',
      'content.stop',
      'content.pageDown',
      'picker.pick',
      'picker.dictate',
    ];
    expect(ids.filter(worksWhileTyping)).toEqual([
      'app.sideAnywhere',
      'app.pageAnywhere',
      'app.previousSession',
      'app.nextSession',
      'app.back',
      'app.forward',
      'app.dictateAnywhere',
      'app.settings',
      'content.stop',
      'content.pageDown',
      'picker.pick',
      'picker.dictate',
    ]);
  });

  it('turns Vim Mode on and off by Mod+Alt+V, and opens with Ctrl keys in either Mode', () => {
    expect(keysOf('app.vim')).toBe('mod+alt+v');
    expect({
      projects: keysOf('app.projectsAnywhere'),
      sessions: keysOf('app.sessionsAnywhere'),
      actions: keysOf('app.actionsAnywhere'),
      newSession: keysOf('app.newSessionAnywhere'),
      sidebar: keysOf('app.sidebarAnywhere'),
    }).toEqual({
      projects: 'ctrl+p',
      sessions: 'ctrl+j',
      actions: 'ctrl+k',
      newSession: 'ctrl+n',
      sidebar: 'ctrl+b',
    });
    const all = keysIn(keys.definition);
    expect(all).not.toContain('Space e');
    expect(keys.checkBindings({}).conflicts).toEqual([]);
  });

  it('works out of Vim Mode for every key that works while typing', () => {
    const typing = (surfaces: Definition): ReadonlyArray<string> =>
      Object.entries(surfaces).flatMap(([name, surface]) => [
        ...Object.entries(surface.actions ?? {}).flatMap(
          ([action, { inField, always }]) =>
            inField === true && always !== true ? [`${name}.${action}`] : [],
        ),
        ...typing(surface.surfaces ?? {}),
      ]);
    expect(typing(keys.definition)).toEqual([]);
  });

  it('lists every Action once in the table people read, each where its Mode says', () => {
    const ids = (surfaces: Definition): ReadonlyArray<string> =>
      Object.entries(surfaces).flatMap(([name, surface]) => [
        ...Object.keys(surface.actions ?? {}).map(
          (action) => `${name}.${action}`,
        ),
        ...ids(surface.surfaces ?? {}),
      ]);
    const listed = keyTable.flatMap(({ rows }) =>
      rows.flatMap(({ always, vim }) => [...always, ...vim]),
    );
    expect([...listed].sort()).toEqual([...ids(keys.definition)].sort());
    // A row's Always keys work out of Vim Mode, its Vim keys only in it.
    const always = new Map<string, boolean>();
    const walk = (surfaces: Definition) => {
      for (const [name, surface] of Object.entries(surfaces)) {
        for (const [action, { always: on }] of Object.entries(
          surface.actions ?? {},
        ))
          always.set(`${name}.${action}`, on === true);
        walk(surface.surfaces ?? {});
      }
    };
    walk(keys.definition);
    for (const { always: both, vim } of keyTable.flatMap(({ rows }) => rows)) {
      for (const id of both) expect([id, always.get(id)]).toEqual([id, true]);
      for (const id of vim) expect([id, always.get(id)]).toEqual([id, false]);
    }
  });

  it('gives Escape nothing of a Dictation', () => {
    const escaping = (surfaces: Definition): ReadonlyArray<string> =>
      Object.values(surfaces).flatMap((surface) => [
        ...Object.values(surface.actions ?? {})
          .filter(({ keys }) =>
            (typeof keys === 'string' ? [keys] : keys).includes('Escape'),
          )
          .map(({ label }) => label),
        ...escaping(surface.surfaces ?? {}),
      ]);
    expect(escaping(keys.definition).join(' ')).not.toMatch(/Dictation/);
  });
});
