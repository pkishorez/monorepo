import type { Definition } from '@kestack/use-keys/surfaces';
import { describe, expect, it } from 'vitest';
import { boundIn, keys, worksWhileTyping } from './keys.ts';

/*
 * The app's keys as the definition writes them: a plain key for each
 * Action of the page and the sidebar, and only Settings, stopping the turn,
 * Ctrl+Space for a Dictation and paging working while typing, besides the
 * Picker's own keys. A Dictation is never Escape's.
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
    });
  });

  it('works while typing only for Settings, stopping, Ctrl+Space, paging and the Picker', () => {
    const ids = [
      'app.side',
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
      'app.dictateAnywhere',
      'app.settings',
      'content.stop',
      'content.pageDown',
      'picker.pick',
      'picker.dictate',
    ]);
  });

  it('has no Vim Mode switch, no Ctrl copies of the plain keys, and no leader', () => {
    const all = keysIn(keys.definition);
    expect(all).not.toContain('mod+alt+v');
    expect(all).not.toContain('Space e');
    for (const gone of ['ctrl+j', 'ctrl+k', 'ctrl+b', 'ctrl+m'])
      expect(all).not.toContain(gone);
    expect(keys.checkBindings({}).conflicts).toEqual([]);
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
