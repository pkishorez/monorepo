// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema } from 'effect';
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
} from 'vitest';
import { keys } from '../../../../../keys.ts';
import {
  type Ask,
  Dictations,
} from '../../../../../layer/capabilities/index.ts';
import * as Picker from '../../../../../ui/picker/index.ts';
import { Toasts } from '../../../../../ui/toast/index.ts';
import { Card, useDraft } from '../card.tsx';
import { Insert } from '../message.ts';
import { SkillPicker } from '../skills.ts';
import { TouchDraft } from './index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Touch Draft on a page that keeps the Draft's text and its Inserts,
 * as the session page does, on a device with no keyboard. It is read
 * only at rest; edit makes it the Composer, focused in the same tap, until
 * Done, focus leaving, or a send. The main button asks the Dictation;
 * Send shows once there is something to send. A Dictation's placeholder
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
    retried: Schema.Array(Schema.Finite),
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Dictation: { pending: Schema.NullOr(Pending) },
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
      retried: [],
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
    Took: (_, { model }) => ({ model: { ...model, pending: null } }),
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
};
let ping = () => {};
let dictate: (pending: typeof Pending.Type | null) => void = () => {};

const PageView = View.make(PageLive, ({ model, children, send }) => {
  page = {
    text: model.text,
    sent: model.sent,
    pings: model.pings,
    retried: model.retried,
  };
  ping = () => send({ _tag: 'Ping' });
  dictate = (pending) => send({ _tag: 'Dictation', pending });
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
      recording: null,
      pending: model.pending,
      onToggle: () => {},
      onTook: (id) => send({ _tag: 'Took', id }),
      onRetry: (id) => send({ _tag: 'Retry', id }),
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
  const App = toReact(PageLive, PageView, dictations, {
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

describe('Touch Draft', () => {
  it('is read only at rest, and a tap on its words does not edit it', async () => {
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(card().dataset['writing']).toBeUndefined();
    await tap(editor());
    expect(editor().getAttribute('contenteditable')).toBe('false');
    expect(document.activeElement).not.toBe(editor());
  });

  it('becomes the Composer from edit, focused in the same tap, until Done', async () => {
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
    expect(button('Dictate')).toBeNull();
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
    await tap(button('Edit the message')!);
    await leave();
    expect(card().dataset['writing']).toBeUndefined();
  });

  it('closes the Composer on a send from it', async () => {
    await tap(button('Edit the message')!);
    await tap(button('Send')!);
    expect(page.sent).toBe(1);
    expect(card().dataset['writing']).toBeUndefined();
    expect(document.activeElement).not.toBe(editor());
  });

  it('shows Send over the microphone only with something to send, and the microphone asks the Dictation', async () => {
    await tap(button('Send')!);
    expect(page.sent).toBe(1);
    await flush();
    expect(button('Send')).toBeNull();
    await tap(button('Dictate')!);
    expect(asks()).toEqual(['Toggle']);
  });

  it('edits from its placeholder while empty', async () => {
    await tap(button('Send')!);
    await flush();
    let focused = false;
    await act(async () => {
      const words =
        card().querySelector<HTMLElement>('p[aria-hidden]')!.parentElement!;
      words.click();
      focused = document.activeElement === editor();
    });
    expect(focused).toBe(true);
    await flush();
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

  it('puts a Dictation at the end of an untouched Draft', async () => {
    await act(async () => dictate({ _tag: 'Transcribing', id: 5 }));
    await act(async () => dictate({ _tag: 'Text', id: 5, text: 'now' }));
    await flush();
    expect(page.text).toBe('Please now');
  });

  it('keeps the same editor, its text, selection and history, when a keyboard turns up', async () => {
    await tap(button('Edit the message')!);
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
      await tap(button('Edit the message')!);
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

    it('shows all of it on a tap on its words, and two lines on the next', async () => {
      const box = () =>
        editor().closest<HTMLElement>('.cm-editor')!.parentElement!
          .parentElement!;
      expect(box().className).toContain('h-14');
      // Its words past two lines fade out at the foot.
      expect(box().className).toContain('black_60%');
      await tap(box());
      expect(box().className).not.toContain('h-14');
      expect(box().className).toContain('overflow-y-auto');
      expect(card().dataset['writing']).toBeUndefined();
      await tap(box());
      expect(box().className).toContain('h-14');
    });
  });
});
