// @vitest-environment jsdom
import { act, useRef, type ReactNode } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { toReact, useChild, View, type ViewProps } from '@kestack/kabuki/react';
import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { MotionGlobalConfig } from '@kestack/web-platform/ui/components/motion';
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
import { keys } from '../../../../../../keys.ts';
import {
  type Ask,
  DeviceState,
  Dictations,
  nothing,
} from '../../../../../../layer/capabilities/index.ts';
import type { Availability } from '../../../../../actors/dictation/index.ts';
import * as Picker from '../../../../../../ui/picker/index.ts';
import { Toasts } from '../../../../../../ui/toast/index.ts';
import { Card, useDraft } from '../../card.tsx';
import { Insert } from '../../message.ts';
import { SkillPicker } from '../../skills.ts';
import { TouchDraft } from './index.ts';

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
 * as the session page does, on a device with no keyboard. It is read
 * only at rest. In voice mode the talk bar asks the Dictation; in text
 * mode a tap on the words makes it the Composer, focused in the same tap,
 * until Done, focus leaving, or a send. Voice is kept in Device State, and
 * can't be had while no Machine can transcribe. A Dictation's placeholder
 * and text go in at the cursor of the last edit, else at the end. Quick
 * actions paste from the clipboard, at the cursor.
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
    retried: Schema.Array(Schema.Finite),
    discarded: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Dictation: { pending: Schema.NullOr(Pending) },
    Recording: { on: Schema.Boolean },
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
      retried: [],
      discarded: 0,
    },
  }),
  children: {
    touch: { actor: TouchDraft.actor },
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
    Recording: ({ on }, { model }) => ({
      model: { ...model, recording: on },
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
/** How the Touch Draft is written, as Device State keeps it. */
let kept = nothing.touchMode;
let ping = () => {};
let dictate: (pending: typeof Pending.Type | null) => void = () => {};
let record: (on: boolean) => void = () => {};

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
  record = (on) => send({ _tag: 'Recording', on });
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
    attachments: [],
    onAttachmentsChange: () => {},
    insert: model.insert,
    onInsert: (what) => send({ _tag: 'Insert', what }),
    // As the Draft does on touch: through the Touch Draft.
    onSend: () =>
      sending.current !== null ? sending.current() : send({ _tag: 'Send' }),
    known: [],
    skills: {
      how: model.picking?.how ?? null,
      offered: true,
      onOpen: (how, typed) => send({ _tag: 'Open', how, typed }),
      picker: null,
    },
    dictation: {
      recording: model.recording ? { _tag: 'Starting' } : null,
      pending: model.pending,
      onToggle: () => {},
      onTook: (id) => send({ _tag: 'Took', id }),
      onRetry: (id) => send({ _tag: 'Retry', id }),
      onCancel: () => send({ _tag: 'Discard' }),
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
        attachments: null,
        onAsk: () => {
          const view = draft.view.current!;
          view.dispatch({ changes: { from: 0, insert: '/btw ' } });
        },
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
let asked: Queue.Queue<typeof Ask.Type>;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
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
const asks = () => Effect.runSync(Queue.clear(asked)).map(({ _tag }) => _tag);

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
  const dictations = Layer.effect(
    Dictations,
    Effect.map(Queue.unbounded<typeof Ask.Type>(), (queue) => {
      asked = queue;
      return { asked: queue };
    }),
  );
  kept = nothing.touchMode;
  const device = Layer.mock(DeviceState)({
    read: Effect.sync(() => ({ ...nothing, touchMode: kept })),
    setTouchMode: (mode) => Effect.sync(() => void (kept = mode)),
    changes: Stream.never,
  });
  const App = toReact(PageLive, PageView, Layer.merge(dictations, device), {
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
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const radio = (label: string) =>
  document.querySelector<HTMLElement>(`[role="radio"][aria-label="${label}"]`)!;
/** Writes by text: a tap on the words edits. */
const toText = () => tap(radio('Text'));
/** Whether what holds `element` takes no tap now. */
const asleep = (element: HTMLElement) => element.closest('[inert]') !== null;

describe('Touch Draft', () => {
  it('is in voice, read only, and a tap on its words does not edit it', async () => {
    expect(radio('Voice').getAttribute('aria-checked')).toBe('true');
    expect(editor().getAttribute('contenteditable')).toBe('false');
    await tap(editor());
    expect(card().dataset['writing']).toBeUndefined();
    expect(document.activeElement).not.toBe(editor());
  });

  it('keeps text, once chosen, in Device State', async () => {
    await toText();
    expect(radio('Text').getAttribute('aria-checked')).toBe('true');
    expect(kept).toBe('text');
    // Its talk bar is gone, its room kept.
    expect(asleep(button('Dictate')!)).toBe(true);
  });

  it('becomes the Composer from a tap on its words in text, focused in the same tap, until Done', async () => {
    await toText();
    let focused = false;
    await act(async () => {
      editor().click();
      // Before anything else runs: iOS raises its keyboard only then.
      focused = document.activeElement === editor();
    });
    expect(focused).toBe(true);
    await flush();
    expect(card().dataset['writing']).toBe('true');
    expect(editor().getAttribute('contenteditable')).toBe('true');
    // Pressed, Done keeps focus, so nothing moves under the finger.
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => void named('Done')!.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    await tap(named('Done')!);
    expect(card().dataset['writing']).toBeUndefined();
    expect(document.activeElement).not.toBe(editor());
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(page.text).toBe('Please ');
  });

  it('is read only again once focus leaves the Composer', async () => {
    await toText();
    await tap(editor());
    await leave();
    expect(card().dataset['writing']).toBeUndefined();
  });

  it('closes the Composer on a send from it', async () => {
    await toText();
    await tap(editor());
    await tap(button('Send')!);
    expect(page.sent).toBe(1);
    expect(card().dataset['writing']).toBeUndefined();
    expect(document.activeElement).not.toBe(editor());
  });

  it('sends only with something to send, and the talk bar asks the Dictation', async () => {
    await tap(button('Send')!);
    expect(page.sent).toBe(1);
    await flush();
    expect(button('Send')!.hasAttribute('disabled')).toBe(true);
    await tap(button('Dictate')!);
    expect(asks()).toEqual(['Toggle']);
  });

  it('stops one that records and sends it, or throws it away', async () => {
    await act(async () => record(true));
    await flush();
    expect(button('Stop and send')).not.toBeNull();
    await tap(button('Cancel the Dictation')!);
    expect(asks()).toEqual(['Cancel']);
    expect(page.sent).toBe(0);
  });

  it('edits from its placeholder while empty', async () => {
    await tap(button('Send')!);
    await flush();
    let focused = false;
    await act(async () => {
      card().querySelector<HTMLElement>('p[aria-hidden]')!.click();
      focused = document.activeElement === editor();
    });
    expect(focused).toBe(true);
    await flush();
    expect(card().dataset['writing']).toBe('true');
  });

  it('shows "Transcribing…" where the cursor of the last edit was, then the text there', async () => {
    await toText();
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

  it("takes a tap on a failed Dictation's Retry at rest, though its words take none", async () => {
    await act(async () =>
      dictate({ _tag: 'Failed', id: 6, reason: 'The model would not load' }),
    );
    await flush();
    const retry = placeholder()!.querySelector('button')!;
    const words = retry.closest<HTMLElement>('.pointer-events-none')!;
    expect(words.className).toContain('[&_button]:pointer-events-auto');
    await tap(retry);
    expect(page.retried).toEqual([6]);
    expect(card().dataset['writing']).toBeUndefined();
  });

  it('tries a failed one again from the talk bar, or throws its recording away', async () => {
    await act(async () =>
      dictate({ _tag: 'Failed', id: 7, reason: 'The model would not load' }),
    );
    await flush();
    await tap(button('Couldn’t transcribe: try again')!);
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
    await toText();
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

  it("takes a tap on a failed Dictation's Retry in text, without editing", async () => {
    await toText();
    await act(async () =>
      dictate({ _tag: 'Failed', id: 8, reason: 'The model would not load' }),
    );
    await flush();
    await tap(placeholder()!.querySelector('button')!);
    expect(page.retried).toEqual([8]);
    expect(card().dataset['writing']).toBeUndefined();
  });

  describe('while no Machine can transcribe', () => {
    beforeAll(() => {
      availability = { _tag: 'Off', reason: 'Turn on Speech to Text' };
    });
    afterAll(() => {
      availability = { _tag: 'Ready' };
    });

    it('is text, and asked for voice, says why instead', async () => {
      expect(radio('Text').getAttribute('aria-checked')).toBe('true');
      await tap(radio("Voice, isn't on"));
      expect(radio('Text').getAttribute('aria-checked')).toBe('true');
      expect(card().textContent).toContain("Voice isn't on");
      expect(kept).toBe('voice');
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

  describe('Quick actions', () => {
    const readText = { current: () => Promise.resolve('copied words') };
    beforeAll(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: () => readText.current() },
      });
    });

    it('lists what else can go in, each with a line', async () => {
      await tap(button('Quick actions')!);
      const drawer = document.querySelector('[data-slot="touch-drawer"]')!;
      const rows = [...drawer.querySelectorAll('button')].map(
        (row) =>
          row.firstElementChild?.nextElementSibling?.firstChild?.textContent,
      );
      expect(rows).toEqual([
        'Ask on the side',
        'Paste',
        'Attach a file',
        'Photo',
      ]);
    });

    it('pastes the clipboard at the cursor of the last edit', async () => {
      await toText();
      await tap(editor());
      const view = EditorView.findFromDOM(editor())!;
      await act(async () => view.dispatch({ selection: { anchor: 0 } }));
      await leave();
      await tap(button('Quick actions')!);
      await tap(named('Paste')!);
      await flush();
      expect(page.text).toBe('copied wordsPlease ');
    });

    it('says so quietly when the clipboard may not be read', async () => {
      readText.current = () => Promise.reject(new Error('NotAllowedError'));
      await tap(button('Quick actions')!);
      await tap(named('Paste')!);
      await flush();
      expect(page.text).toBe('Please ');
      expect(document.body.textContent).toContain("Couldn't paste");
    });

    it('starts a question on the side, editing it', async () => {
      await tap(button('Quick actions')!);
      await tap(named('Ask on the side')!);
      await flush();
      expect(page.text).toBe('/btw Please ');
      expect(card().dataset['writing']).toBe('true');
    });
  });
});
