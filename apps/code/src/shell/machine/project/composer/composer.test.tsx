// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { Composer, SkillPicker, withSkill } from './composer.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The composer on a page that keeps its text and its skills Picker, as the
 * session and new-session pages do. Its editor is the page's default Focus
 * Spot: a skill picked goes into the text and focus comes back to the
 * editor, and an editor drawn afresh, as moving to another session does,
 * takes focus back.
 */

const SKILLS = [
  { name: 'review', description: 'Review the diff' },
  { name: 'deploy', description: 'Ship it' },
];

const Page = Actor.define('Page', {
  model: Schema.Struct({
    text: Schema.String,
    picking: Schema.NullOr(
      Schema.Struct({
        how: Picker.How,
        at: Schema.Finite,
        typed: Schema.Boolean,
      }),
    ),
    opened: Schema.Finite,
    /** Which session is open: a new one draws the composer afresh. */
    session: Schema.Finite,
    pings: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Typed: { text: Schema.String },
    Open: { how: Picker.How, at: Schema.Finite, typed: Schema.Boolean },
    Picked: { name: Schema.NullOr(Schema.String) },
    Switch: {},
  }),
});

const PageLive = Actor.build(Page, {
  init: () => ({
    model: { text: 'Please ', picking: null, opened: 0, session: 0, pings: 0 },
  }),
  children: {
    skills: {
      actor: SkillPicker.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => SkillPicker.opening(model.picking?.how ?? 'keys'),
      props: () => ({
        commands: [],
        skills: SKILLS,
        loading: false,
        problem: null,
      }),
    },
  },
  provides: (self) =>
    SkillPicker.owner((name) => self.send({ _tag: 'Picked', name })),
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Typed: ({ text }, { model }) => ({ model: { ...model, text } }),
    Open: ({ how, at, typed }, { model }) => ({
      model: {
        ...model,
        picking: { how, at, typed },
        opened: model.opened + 1,
      },
    }),
    Picked: ({ name }, { model }) => ({
      model: {
        ...model,
        picking: null,
        text:
          name === null || model.picking === null
            ? model.text
            : withSkill(model.text, name, model.picking),
      },
    }),
    Switch: (_, { model }) => ({
      model: { ...model, session: model.session + 1 },
    }),
  },
});

let page = { text: '', pings: 0 };
let send: (
  message: { readonly _tag: 'Ping' } | { readonly _tag: 'Switch' },
) => void = () => {};

const PageView = View.make(PageLive, ({ model, children, send: sent }) => {
  page = { text: model.text, pings: model.pings };
  send = sent;
  return (
    <keys.Provider>
      <Where />
      <SidebarSpot />
      <keys.Surface id="sidebar">
        <button type="button" ref={sidebarSpot}>
          A row
        </button>
      </keys.Surface>
      <keys.Surface id="content">
        <Composer
          key={model.session}
          label="Message"
          placeholder="Reply"
          text={model.text}
          onTextChange={(text) => sent({ _tag: 'Typed', text })}
          attachments={[]}
          onAttachmentsChange={() => {}}
          onSubmit={() => {}}
          known={SKILLS.map(({ name }) => name)}
          skills={{
            how: model.picking?.how ?? null,
            offered: true,
            onOpen: (how, at, typed) => sent({ _tag: 'Open', how, at, typed }),
            picker: children.skills && (
              <SkillPicker.View instance={children.skills} />
            ),
          }}
        />
      </keys.Surface>
    </keys.Provider>
  );
});

/** Which Surface is Active, as the keyboard holds it. */
let active = '';
function Where() {
  active = keys.useKeyboard().active;
  return null;
}
let sidebarSpot: (element: HTMLElement | null) => void = () => {};
function SidebarSpot() {
  sidebarSpot = keys.useFocusSpot('sidebar', 'row', { default: true });
  return null;
}

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const editor = () => document.querySelector<HTMLElement>('.cm-content');
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const none = () => [] as unknown as DOMRectList;
  const empty = () => new DOMRect();
  Range.prototype.getClientRects = none;
  Range.prototype.getBoundingClientRect = empty;
});

beforeEach(async () => {
  const App = toReact(PageLive, PageView, Layer.empty, {
    name: `composer-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && page.pings === 0; tries++) {
    await act(async () => send({ _tag: 'Ping' }));
    await flush();
  }
  expect(page.pings).toBeGreaterThan(0);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Composer', () => {
  it('puts a skill picked from the Skills button in the text, and gives focus back to the editor', async () => {
    await act(async () => editor()!.focus());
    expect(document.activeElement).toBe(editor());
    const button = [...document.querySelectorAll('button')].find(
      (each) => each.textContent === 'Skills',
    )!;
    await act(async () => button.click());
    await flush();
    expect(document.activeElement).toBe(search());
    await act(async () => {
      search()!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();
    expect(search()).toBeNull();
    expect(page.text).toBe('Please /review ');
    expect(editor()?.textContent).toContain('Please');
    expect(document.activeElement).toBe(editor());
  });

  it('hands Ctrl+H and Ctrl+L to the page while typing, with Vim Mode off', async () => {
    await act(async () => editor()!.focus());
    // Each pressed where focus is: the editor, then the sidebar's row.
    const typed = async (key: string) => {
      await act(async () => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code: `Key${key.toUpperCase()}`,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await flush();
    };
    await typed('h');
    expect(active).toBe('sidebar');
    expect(document.activeElement?.textContent).toBe('A row');
    await typed('l');
    expect(active).toBe('content');
    expect(document.activeElement).toBe(editor());
    expect(page.text).toBe('Please ');
  });

  it('gives focus to a composer drawn afresh, as moving to another session does', async () => {
    await act(async () => editor()!.focus());
    const before = editor();
    await act(async () => send({ _tag: 'Switch' }));
    await flush();
    expect(editor()).not.toBe(before);
    expect(document.activeElement).toBe(editor());
  });
});
