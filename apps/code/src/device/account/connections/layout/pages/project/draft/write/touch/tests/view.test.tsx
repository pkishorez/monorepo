// @vitest-environment jsdom
import { act, useRef, type ReactNode } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View, useChild } from '@kestack/kabuki/react';
import type { ViewProps } from '@kestack/kabuki/react/view';
import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { MotionGlobalConfig } from 'motion/react';
import { GestureProvider } from '@kestack/web-platform/ui/input';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { keys } from '../../../../../../commands.ts';
import { Preferences, nothing } from '../../../../../../../../../store.ts';
import type { Availability } from '../../../../../../../voice/index.ts';
import * as Picker from '../../../../../../../../../../ui/controls/picker/index.ts';
import { Toasts } from '../../../../../../../../../../ui/controls/notice/index.ts';
import { Card, useDraft } from '../../write.tsx';
import { Insert } from '../../../draft.ts';
import { SkillPicker } from '../../../pick/skills.ts';
import { TouchDraft } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// No router around the page: a link to Settings is its words.
vi.mock(import('@kestack/kabuki/routing'), async (actual) => {
  const routing = await actual();
  return {
    ...routing,
    Router: {
      ...routing.Router,
      Link: ({ children }: { readonly children?: ReactNode }) => (
        <a>{children}</a>
      ),
    },
  };
});

/*
 * The Touch Draft on a page that keeps the Draft's text and its Inserts,
 * as the session page does, on a device with no keyboard. It is one
 * line, read only, until a tap on it opens it into the Composer, focus
 * held in the card in the same tap and given to the words once it is
 * open, until Collapse, focus leaving, or a send. With Smart Input a tap
 * only opens it; a tap in its words places the caret, and Edit types. Its microphone asks the Dictation, and can't while no Connection
 * can transcribe. A Dictation's placeholder and text go in at the cursor
 * of the last edit, else at the end. Add pastes from the clipboard, at
 * the cursor.
 */

let initial = 'Please ';

const Pending = Schema.TaggedUnion({
  Transcribing: { id: Schema.Finite },
  Failed: { id: Schema.Finite, reason: Schema.String },
  Text: { id: Schema.Finite, text: Schema.String },
});

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
    recording: Schema.Boolean,
    /** The microphone is live: it records, no longer waits. */
    live: Schema.Boolean,
    retried: Schema.Array(Schema.Finite),
    discarded: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Dictation: { pending: Schema.NullOr(Pending) },
    Recording: { on: Schema.Boolean, live: Schema.Boolean },
    Took: { id: Schema.Finite },
    Retry: { id: Schema.Finite },
    Discard: {},
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
      recording: false,
      live: false,
      retried: [],
      discarded: 0,
    },
  }),
  children: {
    touch: { actor: TouchDraft.actor, input: () => false },
    skills: {
      actor: SkillPicker.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => SkillPicker.opening(model.picking?.how ?? 'keys'),
      props: () => ({
        commands: [],
        skills: [],
        loading: false,
        problem: null,
      }),
    },
  },
  provides: (self) =>
    Layer.merge(
      SkillPicker.owner((name) => self.send({ _tag: 'Picked', name })),
      TouchDraft.owner(self.send({ _tag: 'Send' })),
    ),
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Dictation: ({ pending }, { model }) => ({ model: { ...model, pending } }),
    Recording: ({ on, live }, { model }) => ({
      model: { ...model, recording: on, live },
    }),
    Took: (_, { model }) => ({ model: { ...model, pending: null } }),
    Retry: ({ id }, { model }) => ({
      model: { ...model, retried: [...model.retried, id] },
    }),
    Discard: (_, { model }) => ({
      model: { ...model, pending: null, discarded: model.discarded + 1 },
    }),
    Typed: ({ text }, { model }) => ({ model: { ...model, text } }),
    Insert: ({ what }, { model }) => ({
      model: { ...model, insert: Insert.next(model.insert, what) },
    }),
    Open: ({ how, typed }, { model }) => ({
      model: { ...model, picking: { how, typed }, opened: model.opened + 1 },
    }),
    Picked: (_, { model }) => ({ model: { ...model, picking: null } }),
    Send: (_, { model }) => ({
      model: { ...model, text: '', sent: model.sent + 1 },
    }),
  },
});

let page = {
  text: '',
  sent: 0,
  pings: 0,
  retried: [] as ReadonlyArray<number>,
  discarded: 0,
};
/** Whether a Dictation could start, as the Dictation says. */
let availability: Availability = { _tag: 'Ready' };
/** Text only, as a Side Question: read as it is drawn. */
let textOnly = false;
/** Smart Input, as Preferences keeps it. */
let smart = false;
let ping = () => {};
let dictate: (pending: typeof Pending.Type | null) => void = () => {};
let record: (on: boolean, live?: boolean) => void = () => {};

const PageView = View.make(PageLive, ({ model, children, send }) => {
  page = {
    text: model.text,
    sent: model.sent,
    pings: model.pings,
    retried: model.retried,
    discarded: model.discarded,
  };
  ping = () => send({ _tag: 'Ping' });
  dictate = (pending) => send({ _tag: 'Dictation', pending });
  record = (on, live = false) => send({ _tag: 'Recording', on, live });
  return (
    <GestureProvider>
      <keys.Provider autoFocus={false}>
        <keys.Surface id="content">
          <OnPage model={model} send={send} kids={children} />
        </keys.Surface>
        <input aria-label="Elsewhere" />
      </keys.Provider>
      <Toasts />
    </GestureProvider>
  );
});

function OnPage({
  model,
  send,
  kids,
}: Pick<ViewProps<typeof PageLive>, 'model' | 'send'> & {
  readonly kids: ViewProps<typeof PageLive>['children'];
}) {
  const touchState = useChild(kids.touch, ({ state }) => state._tag);
  const sending = useRef<(() => void) | null>(null);
  const draft = useDraft({
    label: 'Message',
    placeholder: 'Reply',
    text: model.text,
    onTextChange: (text) => send({ _tag: 'Typed', text }),
    textOnly,
    attachments: [],
    onAttachmentsChange: () => {},
    insert: model.insert,
    onInsert: (what) => send({ _tag: 'Insert', what }),
    // As the Draft does on touch: through the Touch Draft.
    onSend: () =>
      sending.current !== null ? sending.current() : send({ _tag: 'Send' }),
    skills: {
      how: model.picking?.how ?? null,
      offered: true,
      onOpen: (how, typed) => send({ _tag: 'Open', how, typed }),
      picker: null,
    },
    dictation: {
      recording: !model.recording
        ? null
        : model.live
          ? {
              _tag: 'Recording',
              microphone: 'Studio Mic',
              elapsed: '0:01',
              level: null,
              wave: null,
            }
          : { _tag: 'Waiting' },
      pending: model.pending,
      onToggle: () => void asked.push('Toggle'),
      onTook: (id) => send({ _tag: 'Took', id }),
      onRetry: (id) => send({ _tag: 'Retry', id }),
      onCancel: () => {
        asked.push('Cancel');
        send({ _tag: 'Discard' });
      },
      availability,
      onShown: () => () => {},
    },
    editing: touchState === 'Editing',
  });
  if (!draft.touch) return <Card draft={draft} />;
  return (
    <TouchDraft.Touch
      value={{
        draft,
        chip: null,
        label: 'Send',
        blocked: false,
        starting: false,
        stop: null,
        attachments: null,
        onPaste: (text) =>
          send({ _tag: 'Insert', what: { _tag: 'Text', text } }),
        sending,
      }}
    >
      <TouchDraft.view instance={kids.touch} />
    </TouchDraft.Touch>
  );
}

let apps = 0;
let root: ReactRoot | undefined;
/** What the Touch Draft asked of the Dictation, through the Draft's mic. */
let asked: Array<string> = [];

/** Lets what was sent settle, and a frame pass: the words take focus in one. */
const flush = () =>
  act(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => void setTimeout(done, 0)),
      ),
  );
const editor = () => document.querySelector<HTMLElement>('.cm-content')!;
const marked = () => document.querySelector<HTMLElement>('.cm-inserted');
const placeholder = () => document.querySelector<HTMLElement>('.cm-dictation');
const card = () => document.querySelector<HTMLElement>('[data-slot="draft"]')!;
const button = (label: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
const named = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    ({ textContent }) => textContent?.startsWith(text),
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
/** What the Touch Draft asked of the Dictation since last read. */
const asks = () => asked.splice(0);

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  MotionGlobalConfig.instantAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.instantAnimations = false;
});

beforeEach(async () => {
  // A device with no keyboard, as the page marks it before the first paint.
  document.documentElement.removeAttribute('data-keyboard');
  asked = [];
  const device = Layer.mock(Preferences)({
    read: Effect.sync(() => ({ ...nothing, smartInput: smart })),
    changes: Stream.never,
  });
  const App = View.app(PageView, {
    layer: device,
    name: `touch-draft-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && page.pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(page.pings).toBeGreaterThan(0);
});

afterEach(async () => {
  textOnly = false;
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

/** Whether what holds `element` takes no tap now. */
const asleep = (element: HTMLElement) => element.closest('[inert]') !== null;
const collapsed = () => card().dataset['collapsed'] === 'true';
const status = () => card().querySelector<HTMLElement>('[role="status"]');

describe('Touch Draft', () => {
  it('is one line, read only, and a tap opens it to edit, the words taking focus once open, until Collapse', async () => {
    expect(collapsed()).toBe(true);
    expect(editor().getAttribute('contenteditable')).toBe('false');
    let held = false;
    await act(async () => {
      editor().click();
      // In the tap, drawn open first, then the words focused: iOS raises
      // its keyboard only for focus given in the tap.
      held = !collapsed() && document.activeElement === editor();
    });
    expect(held).toBe(true);
    await flush();
    expect(collapsed()).toBe(false);
    expect(card().dataset['writing']).toBe('true');
    expect(document.activeElement).toBe(editor());
    expect(editor().getAttribute('contenteditable')).toBe('true');
    expect(named('Edit')).toBeUndefined();
    // Pressed, Collapse keeps focus, so nothing moves under the finger.
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => void button('Collapse')!.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    await tap(button('Collapse')!);
    expect(collapsed()).toBe(true);
    expect(document.activeElement).not.toBe(editor());
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(page.text).toBe('Please ');
  });

  it('opens from a tap anywhere on the line but its buttons', async () => {
    await tap(card());
    expect(collapsed()).toBe(false);
    expect(document.activeElement).toBe(editor());
  });

  it('collapses once focus leaves the Composer', async () => {
    await tap(editor());
    await leave();
    expect(collapsed()).toBe(true);
  });

  // A press as a finger makes it: down, and up again before focus moves.
  const press = (target: Element) =>
    act(async () => {
      target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      target.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });

  it('stays open, typing done, when a press on its own button takes focus from the words, as iOS gives the button none', async () => {
    await tap(editor());
    await press(button('Add')!);
    await act(async () => editor().blur());
    expect(collapsed()).toBe(false);
    expect(card().dataset['writing']).toBeUndefined();
    await tap(button('Add')!);
    expect(collapsed()).toBe(false);
  });

  it('collapses when the words lose focus after a press in it has ended, as the keyboard put away', async () => {
    await press(editor());
    await tap(editor());
    // Its press ended with its click: the keyboard's own Done is no press.
    await act(async () => editor().blur());
    expect(collapsed()).toBe(true);
  });

  it('collapses for a press outside it, though one in it came just before', async () => {
    await tap(editor());
    await press(button('Add')!);
    // Ended without a click, as a finger dragged off; a press outside begins.
    await press(document.body);
    await act(async () => editor().blur());
    expect(collapsed()).toBe(true);
  });

  it('collapses on a send from the Composer', async () => {
    await tap(editor());
    await tap(button('Send')!);
    expect(page.sent).toBe(1);
    expect(collapsed()).toBe(true);
    expect(document.activeElement).not.toBe(editor());
  });

  it('shows Send only with something to send, and the microphone asks the Dictation', async () => {
    await tap(button('Send')!);
    expect(page.sent).toBe(1);
    await flush();
    expect(button('Send')).toBeNull();
    await tap(button('Dictate')!);
    expect(asks()).toEqual(['Toggle']);
  });

  it('stops one that records and keeps it, sends it, or throws it away, all in the line', async () => {
    await act(async () => record(true, true));
    await flush();
    expect(collapsed()).toBe(true);
    expect(status()!.textContent).toContain('0:01');
    expect(button('Stop and send')).not.toBeNull();
    await tap(button('Stop, and keep it to read')!);
    expect(asks()).toEqual(['Toggle']);
    await act(async () => record(true, true));
    await flush();
    await tap(button('Cancel the Dictation')!);
    expect(asks()).toEqual(['Cancel']);
    expect(page.sent).toBe(0);
  });

  it('says it waits while the microphone opens, then records once it is live', async () => {
    await act(async () => record(true));
    await flush();
    expect(status()!.textContent).toContain('Starting the microphone');
    expect(button('Stop and send')).toBeNull();
    await act(async () => record(true, true));
    await flush();
    expect(status()!.textContent).toContain('0:01');
  });

  it('lets go of the microphone on Cancel while it waits', async () => {
    await act(async () => record(true));
    await flush();
    await tap(button('Cancel the Dictation')!);
    expect(asks()).toEqual(['Cancel']);
  });

  it('opens to edit from its placeholder while empty', async () => {
    await tap(button('Send')!);
    await flush();
    await tap(card().querySelector<HTMLElement>('p[aria-hidden]')!);
    expect(card().dataset['writing']).toBe('true');
    expect(document.activeElement).toBe(editor());
  });

  it('shows "Transcribing…" where the cursor of the last edit was, then the text there', async () => {
    await tap(editor());
    const view = EditorView.findFromDOM(editor())!;
    await act(async () => view.dispatch({ selection: { anchor: 6 } }));
    await leave();
    await act(async () => dictate({ _tag: 'Transcribing', id: 4 }));
    await flush();
    expect(placeholder()?.textContent).toBe('transcribing…');
    await act(async () => dictate({ _tag: 'Text', id: 4, text: 'look' }));
    await flush();
    expect(page.text).toBe('Please look ');
    expect(placeholder()).toBeNull();
    expect(marked()?.textContent).toBe(' look');
  });

  it("takes a tap on a failed Dictation's Retry, without expanding", async () => {
    await act(async () =>
      dictate({ _tag: 'Failed', id: 6, reason: 'The model would not load' }),
    );
    await flush();
    const retry = placeholder()!.querySelector('button')!;
    const words = retry.closest<HTMLElement>('.pointer-events-none')!;
    expect(words.className).toContain('[&_button]:pointer-events-auto');
    await tap(retry);
    expect(page.retried).toEqual([6]);
    expect(collapsed()).toBe(true);
  });

  it('tries a failed one again, or throws its recording away', async () => {
    await act(async () =>
      dictate({ _tag: 'Failed', id: 7, reason: 'The model would not load' }),
    );
    await flush();
    await tap(button('Try again')!);
    expect(page.retried).toEqual([7]);
    await tap(button('Throw the recording away')!);
    expect(page.discarded).toBe(1);
  });

  it('puts a Dictation at the end of an untouched Draft', async () => {
    await act(async () => dictate({ _tag: 'Transcribing', id: 5 }));
    await act(async () => dictate({ _tag: 'Text', id: 5, text: 'now' }));
    await flush();
    expect(page.text).toBe('Please now');
  });

  it('keeps the same editor, its text, selection and history, when a keyboard turns up', async () => {
    await tap(editor());
    const view = EditorView.findFromDOM(editor())!;
    await act(async () =>
      view.dispatch({
        changes: { from: 7, insert: 'look' },
        selection: { anchor: 2, head: 5 },
      }),
    );
    await leave();
    // A key pressed outside a text field: a hardware keyboard.
    await act(async () =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }),
      ),
    );
    await flush();
    expect(card().dataset['touch']).toBeUndefined();
    expect(card().contains(editor())).toBe(true);
    expect(EditorView.findFromDOM(editor())).toBe(view);
    expect(view.state.doc.toString()).toBe('Please look');
    expect(view.state.selection.main).toMatchObject({ anchor: 2, head: 5 });
    expect(undoDepth(view.state)).toBe(1);
  });

  it('keeps its cursor and selection when it is touched again after keys', async () => {
    const keys = () =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }),
      );
    await act(async () => keys());
    await flush();
    expect(card().dataset['touch']).toBeUndefined();
    const view = EditorView.findFromDOM(editor())!;
    await act(async () => view.dispatch({ selection: { anchor: 2, head: 5 } }));
    // A finger on the screen: touch again.
    await act(async () =>
      window.dispatchEvent(
        Object.assign(new Event('pointerdown', { bubbles: true }), {
          pointerType: 'touch',
        }),
      ),
    );
    await flush();
    expect(card().dataset['touch']).toBe('');
    expect(view.state.selection.main).toMatchObject({ anchor: 2, head: 5 });
  });

  describe('with Smart Input', () => {
    beforeAll(() => void (smart = true));
    afterAll(() => void (smart = false));

    it('only opens on a tap, the keyboard down', async () => {
      await tap(editor());
      expect(collapsed()).toBe(false);
      expect(card().dataset['writing']).toBeUndefined();
      expect(card().contains(document.activeElement)).toBe(false);
      expect(editor().getAttribute('contenteditable')).toBe('false');
    });

    it('places the caret on a tap in its words, without editing', async () => {
      await tap(editor());
      await tap(editor());
      expect(card().dataset['writing']).toBeUndefined();
      expect(named('Edit')).not.toBeUndefined();
    });

    it('edits from Edit, focused in the same tap, until Done, staying open', async () => {
      await tap(editor());
      let focused = false;
      await act(async () => {
        named('Edit')!.click();
        focused = document.activeElement === editor();
      });
      expect(focused).toBe(true);
      await flush();
      expect(card().dataset['writing']).toBe('true');
      await tap(named('Done')!);
      expect(card().dataset['writing']).toBeUndefined();
      expect(collapsed()).toBe(false);
      expect(document.activeElement).not.toBe(editor());
      expect(named('Edit')).not.toBeUndefined();
    });

    it('keeps the cursor placed through Edit, as the browser moves it to the start', async () => {
      await tap(editor());
      const view = EditorView.findFromDOM(editor())!;
      await act(async () => view.dispatch({ selection: { anchor: 4 } }));
      await tap(named('Edit')!);
      expect(view.state.selection.main.head).toBe(4);
      // iOS, as its keyboard rises: undone.
      await act(async () =>
        view.dispatch({ selection: { anchor: 0 }, userEvent: 'select' }),
      );
      await flush();
      expect(view.state.selection.main.head).toBe(4);
      // A tap of the user's own: kept.
      await act(async () =>
        view.dispatch({
          selection: { anchor: 2 },
          userEvent: 'select.pointer',
        }),
      );
      await flush();
      expect(view.state.selection.main.head).toBe(2);
    });

    it('replaces what is selected, the keyboard down, with the next Dictation', async () => {
      await tap(editor());
      const view = EditorView.findFromDOM(editor())!;
      // "Please" selected, as a press held on it would.
      await act(async () =>
        view.dispatch({ selection: { anchor: 0, head: 6 } }),
      );
      expect(card().dataset['writing']).toBeUndefined();
      await act(async () => dictate({ _tag: 'Transcribing', id: 11 }));
      await act(async () => dictate({ _tag: 'Text', id: 11, text: 'Kindly' }));
      await flush();
      expect(page.text).toBe('Kindly ');
    });

    it('stays open as focus leaves while editing, and collapses only from Collapse', async () => {
      await tap(editor());
      await tap(named('Edit')!);
      await leave();
      expect(card().dataset['writing']).toBeUndefined();
      expect(collapsed()).toBe(false);
      await tap(button('Collapse')!);
      expect(collapsed()).toBe(true);
    });
  });

  describe('while no Connection can transcribe', () => {
    beforeAll(() => {
      availability = { _tag: 'Off', reason: 'Turn on Speech to Text' };
    });
    afterAll(() => {
      availability = { _tag: 'Ready' };
    });

    it('says why on the microphone, asking nothing', async () => {
      await tap(button('Dictate')!);
      expect(card().textContent).toContain("Voice isn't on");
      expect(asks()).toEqual([]);
    });

    it('still throws a failed one away', async () => {
      await act(async () =>
        dictate({ _tag: 'Failed', id: 9, reason: 'The model would not load' }),
      );
      await flush();
      expect(asleep(button('Throw the recording away')!)).toBe(false);
      await tap(button('Throw the recording away')!);
      expect(page.discarded).toBe(1);
    });
  });

  describe('Add', () => {
    const readText = { current: () => Promise.resolve('copied words') };
    beforeAll(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: () => readText.current() },
      });
    });
    const rows = () =>
      [
        ...document
          .querySelector('[data-slot="touch-drawer"]')!
          .querySelectorAll('button'),
      ].map(
        (row) =>
          row.firstElementChild?.nextElementSibling?.firstChild?.textContent,
      );

    it('lists what else can go in, each with a line', async () => {
      await tap(button('Add')!);
      expect(rows()).toEqual(['Skill', 'Paste', 'Attach a file', 'Photo']);
    });

    it('has no Skill nor file when text only, as a Side Question', async () => {
      textOnly = true;
      await act(async () => ping());
      await flush();
      await tap(button('Add')!);
      expect(rows()).toEqual(['Paste']);
    });

    it('opens the skills Picker', async () => {
      await tap(button('Add')!);
      await tap(named('Skill')!);
      await flush();
      expect(document.querySelector('[aria-label="Skills"]')).not.toBeNull();
    });

    it('pastes the clipboard at the cursor of the last edit', async () => {
      await tap(editor());
      const view = EditorView.findFromDOM(editor())!;
      await act(async () => view.dispatch({ selection: { anchor: 0 } }));
      await leave();
      await tap(button('Add')!);
      await tap(named('Paste')!);
      await flush();
      expect(page.text).toBe('copied wordsPlease ');
    });

    it('says so quietly when the clipboard may not be read', async () => {
      readText.current = () => Promise.reject(new Error('NotAllowedError'));
      await tap(button('Add')!);
      await tap(named('Paste')!);
      await flush();
      expect(page.text).toBe('Please ');
      expect(document.body.textContent).toContain("Couldn't paste");
    });
  });
});
