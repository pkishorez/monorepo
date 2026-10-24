// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { toReact, View, type ViewProps } from '@kestack/kabuki/react';
import { EditorView } from '@codemirror/view';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { keys } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import { Card, StatusLine, useDraft } from './card.tsx';
import { Insert } from './message.ts';
import { SkillPicker } from './skills.ts';
import { TouchCard } from './touch.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Draft on a page that keeps its text, its Inserts and its skills
 * Picker, as the session and new-session pages do. It is read only until
 * `i` makes it the Composer, and Escape makes it read only again, keeping
 * its text. Enter sends it from the page's Normal Mode. A Skill, a paste
 * anywhere on the page, a Dictation's text, each goes in at the cursor,
 * marked while it fades, and `u` takes it back out. A Dictation on its way
 * is a placeholder there, which offers a retry when it fails. The line
 * over it says Draft or Editing; while a Dictation records, it shows the
 * Dictation instead, and while one is written out for it, that it is.
 * Its one primary button is the mic while there is nothing to send, Send
 * once there is, and stops a Dictation while one records.
 *
 * On a device with no keyboard it is read only at rest, two lines tall
 * until expanded, and its edit button makes it the Composer, focused in
 * the same tap, until focus leaves it. A Dictation's placeholder and text
 * go in at the cursor of the last edit, else at the end.
 */

// What the device can be driven by, and the Draft's text as it opens.
let touch = false;
let initial = 'Please ';

const Pending = Schema.TaggedUnion({
  Transcribing: { id: Schema.Finite },
  Failed: { id: Schema.Finite, reason: Schema.String },
  Text: { id: Schema.Finite, text: Schema.String },
});

const Recording = Schema.TaggedUnion({
  Starting: {},
  Recording: { microphone: Schema.String },
});

const SKILLS = [
  { name: 'review', description: 'Review the diff' },
  { name: 'deploy', description: 'Ship it' },
];

const Page = Actor.define('Page', {
  model: Schema.Struct({
    text: Schema.String,
    insert: Schema.NullOr(Insert.Schema),
    picking: Schema.NullOr(
      Schema.Struct({ how: Picker.How, typed: Schema.Boolean }),
    ),
    opened: Schema.Finite,
    sent: Schema.Finite,
    pings: Schema.Finite,
    pending: Schema.NullOr(Pending),
    recording: Schema.NullOr(Recording),
    took: Schema.Array(Schema.Finite),
    retried: Schema.Array(Schema.Finite),
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Dictation: { pending: Schema.NullOr(Pending) },
    Record: { recording: Schema.NullOr(Recording) },
    Took: { id: Schema.Finite },
    Retry: { id: Schema.Finite },
    Typed: { text: Schema.String },
    Insert: { what: Insert.What },
    Open: { how: Picker.How, typed: Schema.Boolean },
    Picked: { name: Schema.NullOr(Schema.String) },
    Send: {},
  }),
});

const PageLive = Actor.build(Page, {
  init: () => ({
    model: {
      text: initial,
      insert: null,
      picking: null,
      opened: 0,
      sent: 0,
      pings: 0,
      pending: null,
      recording: null,
      took: [],
      retried: [],
    },
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
    Dictation: ({ pending }, { model }) => ({ model: { ...model, pending } }),
    Record: ({ recording }, { model }) => ({ model: { ...model, recording } }),
    // Taken, the Dictation is done, as the app's own says.
    Took: ({ id }, { model }) => ({
      model: { ...model, pending: null, took: [...model.took, id] },
    }),
    Retry: ({ id }, { model }) => ({
      model: { ...model, retried: [...model.retried, id] },
    }),
    Typed: ({ text }, { model }) => ({ model: { ...model, text } }),
    Insert: ({ what }, { model }) => ({
      model: { ...model, insert: Insert.next(model.insert, what) },
    }),
    Open: ({ how, typed }, { model }) => ({
      model: { ...model, picking: { how, typed }, opened: model.opened + 1 },
    }),
    Picked: ({ name }, { model }) => ({
      model: {
        ...model,
        picking: null,
        insert:
          name === null || model.picking === null
            ? model.insert
            : Insert.next(model.insert, {
                _tag: 'Skill',
                name,
                typed: model.picking.typed,
              }),
      },
    }),
    Send: (_, { model }) => ({
      model: { ...model, text: '', sent: model.sent + 1 },
    }),
  },
});

let page: {
  text: string;
  sent: number;
  pings: number;
  took: ReadonlyArray<number>;
  retried: ReadonlyArray<number>;
} = { text: '', sent: 0, pings: 0, took: [], retried: [] };
let ping = () => {};
let dictate: (pending: typeof Pending.Type | null) => void = () => {};
let record: (recording: typeof Recording.Type | null) => void = () => {};
let shown = 0;
let toggled = 0;

const PageView = View.make(PageLive, ({ model, children, send }) => {
  page = {
    text: model.text,
    sent: model.sent,
    pings: model.pings,
    took: model.took,
    retried: model.retried,
  };
  ping = () => send({ _tag: 'Ping' });
  dictate = (pending) => send({ _tag: 'Dictation', pending });
  record = (recording) => send({ _tag: 'Record', recording });
  return (
    <keys.Provider vim>
      <keys.Surface id="content">
        <OnPage model={model} send={send} picker={children.skills} />
      </keys.Surface>
      <input aria-label="Elsewhere" />
    </keys.Provider>
  );
});

function OnPage({
  model,
  send,
  picker,
}: Pick<ViewProps<typeof PageLive>, 'model' | 'send'> & {
  readonly picker: ViewProps<typeof PageLive>['children']['skills'];
}) {
  const page = keys.useFocusSpot('content', 'page', { default: true });
  const draft = useDraft({
    label: 'Message',
    placeholder: 'Reply',
    text: model.text,
    onTextChange: (text) => send({ _tag: 'Typed', text }),
    attachments: [],
    onAttachmentsChange: () => {},
    insert: model.insert,
    onInsert: (what) => send({ _tag: 'Insert', what }),
    onSend: () => send({ _tag: 'Send' }),
    known: SKILLS.map(({ name }) => name),
    skills: {
      how: model.picking?.how ?? null,
      offered: true,
      onOpen: (how, typed) => send({ _tag: 'Open', how, typed }),
      picker: picker && <SkillPicker.View instance={picker} />,
    },
    dictation: {
      recording:
        model.recording?._tag === 'Recording'
          ? {
              ...model.recording,
              elapsed: '0:07',
              level: <span data-testid="level" />,
            }
          : model.recording,
      pending: model.pending,
      onToggle: () => void toggled++,
      onTook: (id) => send({ _tag: 'Took', id }),
      onRetry: (id) => send({ _tag: 'Retry', id }),
      onShown: showing,
    },
  });
  if (touch)
    return (
      <div ref={page} tabIndex={-1} data-testid="page">
        <TouchCard
          draft={draft}
          chip={null}
          send={<button type="button" aria-label="Send" onClick={draft.send} />}
        />
      </div>
    );
  return (
    <div ref={page} tabIndex={-1} data-testid="page">
      <Card draft={draft} />
      <StatusLine
        draft={draft}
        send={<button type="button" aria-label="Send" onClick={draft.send} />}
      />
    </div>
  );
}

function showing() {
  shown++;
  return () => void shown--;
}

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const editor = () => document.querySelector<HTMLElement>('.cm-content')!;
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');
const marked = () => document.querySelector<HTMLElement>('.cm-inserted');
const placeholder = () => document.querySelector<HTMLElement>('.cm-dictation');
const card = () => document.querySelector<HTMLElement>('[data-slot="draft"]')!;
/** The line over the Draft, as read, part by part. */
const heading = () =>
  [...card().firstElementChild!.children]
    .map(({ textContent }) => textContent)
    .filter((text) => text !== '')
    .join(' | ');

const key = async (name: string, code: string) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code,
        bubbles: true,
        cancelable: true,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, code, bubbles: true }),
    );
  });
  await flush();
};

/** A paste of `text` on `target`, as the browser fires it. */
const paste = async (target: Element, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [],
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
  await act(async () => void target.dispatchEvent(event));
  await flush();
};

/** Picks the highlighted skill in the open Picker. */
const pick = async () => {
  expect(document.activeElement).toBe(search());
  await key('Enter', 'Enter');
  expect(search()).toBeNull();
};

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
  // As the page marks it before the first paint.
  document.documentElement.toggleAttribute('data-keyboard', !touch);
  const App = toReact(PageLive, PageView, Layer.empty, {
    name: `draft-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && page.pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(page.pings).toBeGreaterThan(0);
  await act(async () =>
    document.querySelector<HTMLElement>('[data-testid="page"]')!.focus(),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Draft', () => {
  it('is read only until `i` makes it the Composer, and Escape makes it read only again', async () => {
    expect(editor().getAttribute('contenteditable')).toBe('false');
    await key('i', 'KeyI');
    expect(editor().getAttribute('contenteditable')).toBe('true');
    expect(document.activeElement).toBe(editor());
    await key('Escape', 'Escape');
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(page.text).toBe('Please ');
  });

  it('sends on Enter from the page, only with text', async () => {
    await key('Enter', 'Enter');
    expect(page.sent).toBe(1);
    expect(page.text).toBe('');
    await key('Enter', 'Enter');
    expect(page.sent).toBe(1);
  });

  it('has one primary button: Send with something to send, else the mic, which stops a Dictation recording', async () => {
    const primary = () =>
      document.querySelector('[data-slot="dictate"], [aria-label="Send"]')!;
    expect(primary().getAttribute('aria-label')).toBe('Send');
    await key('Enter', 'Enter');
    expect(primary().getAttribute('aria-label')).toBe('Dictate');
    const before = toggled;
    await act(async () => (primary() as HTMLElement).click());
    expect(toggled).toBe(before + 1);
    await act(async () =>
      record({ _tag: 'Recording', microphone: 'MacBook Pro Microphone' }),
    );
    await flush();
    expect(primary().getAttribute('aria-label')).toBe('Stop the Dictation');
  });

  it('puts a skill picked by `/` in at the cursor, marked, and `u` takes it out', async () => {
    await key('/', 'Slash');
    await pick();
    expect(page.text).toBe('Please /review ');
    expect(marked()?.textContent).toContain('/review');
    await act(async () => {
      marked()!.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(marked()).toBeNull();
    await key('u', 'KeyU');
    expect(page.text).toBe('Please ');
  });

  it('puts what is pasted in the Composer in at its cursor, the same way', async () => {
    await key('i', 'KeyI');
    await paste(editor(), 'hello');
    expect(page.text).toBe('Please hello');
    expect(marked()?.textContent).toBe('hello');
  });

  it('puts what is pasted anywhere on the page in at the cursor, but not in another field', async () => {
    await paste(document.body, 'hello');
    expect(page.text).toBe('Please hello');
    await paste(
      document.querySelector('input[aria-label="Elsewhere"]')!,
      'away',
    );
    expect(page.text).toBe('Please hello');
    await key('u', 'KeyU');
    expect(page.text).toBe('Please ');
  });

  it('says over it that it is the Draft, or the Composer, and the key that changes it', async () => {
    expect(heading()).toBe('Draft | i to edit');
    await key('i', 'KeyI');
    expect(heading()).toBe('Editing | Esc when done');
  });

  it('shows a Dictation recording over it in place of that, with the time, the level, the microphone and its keys', async () => {
    expect(shown).toBe(1);
    await act(async () => record({ _tag: 'Starting' }));
    await flush();
    expect(heading()).toBe(
      'Opening the microphone… | Space to stop · d microphone',
    );
    await act(async () =>
      record({ _tag: 'Recording', microphone: 'MacBook Pro Microphone' }),
    );
    await flush();
    expect(card().dataset['recording']).toBe('true');
    expect(heading()).toBe(
      'Recording | 0:07 | MacBook Pro Microphone | Space to stop · d microphone',
    );
    expect(document.querySelector('[data-testid="level"]')).not.toBeNull();
    await act(async () => record(null));
    await act(async () => dictate({ _tag: 'Transcribing', id: 3 }));
    await flush();
    expect(card().dataset['recording']).toBeUndefined();
    expect(heading()).toBe('Transcribing…');
    await act(async () => dictate(null));
    await flush();
    expect(heading()).toBe('Draft | i to edit');
  });

  it('waits for a Dictation at the cursor, then puts its text there as one insert `u` takes out', async () => {
    await act(async () => dictate({ _tag: 'Transcribing', id: 1 }));
    await flush();
    expect(placeholder()?.textContent).toBe('transcribing…');
    expect(page.text).toBe('Please ');
    await act(async () => dictate({ _tag: 'Text', id: 1, text: 'look here' }));
    await flush();
    expect(page.text).toBe('Please look here');
    expect(page.took).toEqual([1]);
    expect(placeholder()).toBeNull();
    expect(marked()?.textContent).toBe('look here');
    await key('u', 'KeyU');
    expect(page.text).toBe('Please ');
    expect(placeholder()).toBeNull();
  });

  it('offers a retry when the Dictation fails, and lets go of it when it is gone', async () => {
    await act(async () =>
      dictate({ _tag: 'Failed', id: 2, reason: 'The model would not load' }),
    );
    await flush();
    const retry = placeholder()?.querySelector('button');
    expect(retry?.textContent).toBe('couldn’t transcribe — retry');
    expect(retry?.title).toBe('The model would not load');
    await act(async () => retry!.click());
    await flush();
    expect(page.retried).toEqual([2]);
    await act(async () => dictate({ _tag: 'Transcribing', id: 2 }));
    await flush();
    expect(placeholder()?.textContent).toBe('transcribing…');
    await act(async () => dictate(null));
    await flush();
    expect(placeholder()).toBeNull();
    expect(page.text).toBe('Please ');
  });
});

describe('Draft, on a device with no keyboard', () => {
  beforeAll(() => {
    touch = true;
  });
  afterAll(() => {
    touch = false;
  });

  const button = (label: string) =>
    document.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
  const pill = () =>
    [...document.querySelectorAll<HTMLElement>('button')].find(
      ({ textContent }) => textContent === 'Write a message…',
    );
  const tap = async (target: HTMLElement) => {
    await act(async () => target.click());
    await flush();
  };
  const leave = async () => {
    await act(async () =>
      document
        .querySelector<HTMLElement>('input[aria-label="Elsewhere"]')!
        .focus(),
    );
    await flush();
  };

  it('is read only at rest, and a tap on its words does nothing', async () => {
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(card().dataset['writing']).toBeUndefined();
    await act(async () => {
      for (const type of ['pointerdown', 'pointerup'])
        editor().dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerType: 'touch' }),
        );
      editor().click();
    });
    await flush();
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(document.activeElement).not.toBe(editor());
  });

  it('becomes the Composer from its edit button, focused in the same tap, and read only again once focus leaves', async () => {
    let focused = false;
    await act(async () => {
      button('Edit the message')!.click();
      // Before anything else runs: iOS raises its keyboard only then.
      focused = document.activeElement === editor();
    });
    expect(focused).toBe(true);
    await flush();
    expect(card().dataset['writing']).toBe('true');
    expect(editor().getAttribute('contenteditable')).toBe('true');
    expect(button('Edit the message')).toBeNull();
    await leave();
    expect(card().dataset['writing']).toBeUndefined();
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(page.text).toBe('Please ');
  });

  it('is one wide pill while empty, which edits it too', async () => {
    expect(pill()).toBeUndefined();
    await tap(button('Send')!);
    expect(page.text).toBe('');
    // Send keeps its place, hidden, so the microphone does not move.
    expect(button('Send')!.closest('.invisible')).not.toBeNull();
    expect(button('Edit the message')).toBeNull();
    let focused = false;
    await act(async () => {
      pill()!.click();
      focused = document.activeElement === editor();
    });
    expect(focused).toBe(true);
    await flush();
    expect(pill()).toBeUndefined();
    expect(card().dataset['writing']).toBe('true');
  });

  it('shows "Transcribing…" where the cursor of the last edit was, then the text there', async () => {
    await tap(button('Edit the message')!);
    const view = EditorView.findFromDOM(editor())!;
    await act(async () => view.dispatch({ selection: { anchor: 6 } }));
    await leave();
    await act(async () => dictate({ _tag: 'Transcribing', id: 4 }));
    await flush();
    expect(placeholder()?.textContent).toBe('transcribing…');
    expect(editor().getAttribute('contenteditable')).toBe('false');
    await act(async () => dictate({ _tag: 'Text', id: 4, text: 'look' }));
    await flush();
    expect(page.text).toBe('Please look ');
    expect(placeholder()).toBeNull();
    expect(marked()?.textContent).toBe(' look');
  });

  it('puts a Dictation at the end of an untouched Draft', async () => {
    await act(async () => dictate({ _tag: 'Transcribing', id: 5 }));
    await act(async () => dictate({ _tag: 'Text', id: 5, text: 'now' }));
    await flush();
    expect(page.text).toBe('Please now');
  });

  describe('with more than two lines', () => {
    const scrollHeight = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollHeight',
    );
    const Observer = globalThis.ResizeObserver;
    beforeAll(() => {
      initial = 'A long message. '.repeat(20);
      // It hears its first size once the editor is drawn, as a browser's.
      globalThis.ResizeObserver = class {
        constructor(private readonly heard: () => void) {}
        observe() {
          queueMicrotask(() => this.heard());
        }
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
      // jsdom lays nothing out: the editor's words say how tall it is.
      Object.defineProperty(Element.prototype, 'scrollHeight', {
        configurable: true,
        get(this: Element) {
          return (this.textContent?.length ?? 0) > 100 ? 280 : 28;
        },
      });
    });
    afterAll(() => {
      initial = 'Please ';
      globalThis.ResizeObserver = Observer;
      if (scrollHeight !== undefined)
        Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeight);
    });

    it('expands to all of it and back to two lines', async () => {
      const box = () =>
        editor().closest<HTMLElement>('.cm-editor')!.parentElement!
          .parentElement!;
      expect(box().className).toContain('h-14');
      await tap(button('Show all of it')!);
      expect(box().className).not.toContain('h-14');
      expect(box().className).toContain('overflow-y-auto');
      expect(button('Show two lines')?.getAttribute('aria-expanded')).toBe(
        'true',
      );
      await tap(button('Show two lines')!);
      expect(box().className).toContain('h-14');
      expect(button('Show all of it')).not.toBeNull();
    });
  });
});
