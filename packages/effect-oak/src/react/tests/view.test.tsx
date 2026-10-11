// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Actor } from '../../core/index.ts';
import { View, toReact } from '../index.ts';
import type { ViewProps } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Every draw counts its renders by Instance ID and keeps its `send`.
let renders: Record<string, number> = {};
let sends: Record<string, (message: never) => void> = {};
const drew = (self: { readonly id: string; readonly send: unknown }) => {
  renders[self.id] = (renders[self.id] ?? 0) + 1;
  sends[self.id] = self.send as (message: never) => void;
};
const send = <M,>(id: string, message: M) =>
  act(() => (sends[id] as (message: M) => void)(message));

let host: HTMLDivElement;
let root: ReactRoot;

beforeEach(() => {
  renders = {};
  sends = {};
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** Mount an app and wait for its Runtime to go live. */
const mount = async (app: ReactNode) => {
  await act(async () => root.render(app));
  for (let tries = 0; tries < 50 && !host.firstChild; tries++)
    await act(() => new Promise((done) => setTimeout(done, 0)));
};

// A row, one per key ---------------------------------------------------------------

const Row = Actor.make('Row', {
  input: Schema.Struct({ text: Schema.String }),
  model: Schema.Struct({ text: Schema.String, bumps: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: ({ text }) => ({ model: { text, bumps: 0 } }),
  update: {
    Bumped: (_, { model }) => ({ model: { ...model, bumps: model.bumps + 1 } }),
  },
});

const RowView = View.make(
  Row,
  (self, { selected }: { readonly selected: boolean }) => {
    drew(self);
    return (
      <li {...self.root} data-selected={selected}>
        {self.model.text}:{self.model.bumps}
      </li>
    );
  },
);

const Header = Actor.make('Header', {
  model: Schema.Struct({ clicks: Schema.Number }),
  message: Schema.TaggedUnion({ Clicked: {} }),
}).build({
  init: () => ({ model: { clicks: 0 } }),
  update: {
    Clicked: (_, { model }) => ({ model: { clicks: model.clicks + 1 } }),
  },
});

const HeaderView = View.make(Header, (self) => {
  drew(self);
  return <h1>{self.model.clicks}</h1>;
});

// A list with a fixed Child and keyed Children ------------------------------------

const List = Actor.make('List', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    next: Schema.Number,
    selected: Schema.String,
    title: Schema.String,
  }),
  message: Schema.TaggedUnion({
    Added: {},
    Removed: { id: Schema.String },
    Selected: { id: Schema.String },
    Retitled: { title: Schema.String },
  }),
  children: { header: Header, rows: Actor.many(Row) },
}).build({
  init: () => ({
    model: { ids: ['a', 'b', 'c'], next: 0, selected: 'a', title: 'List' },
  }),
  invoke: ({ model }) => ({
    rows: model.ids.map((id) => ({ key: id, input: { text: id } })),
  }),
  update: {
    Added: (_, { model }) => ({
      model: {
        ...model,
        ids: [...model.ids, `n${model.next}`],
        next: model.next + 1,
      },
    }),
    Removed: ({ id }, { model }) => ({
      model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
    }),
    Selected: ({ id }, { model }) => ({ model: { ...model, selected: id } }),
    Retitled: ({ title }, { model }) => ({ model: { ...model, title } }),
  },
});

const ListView = View.make(List, (self) => {
  drew(self);
  const { model, children } = self;
  return (
    <section>
      <h2>{model.title}</h2>
      <HeaderView instance={children.header} />
      <ul>
        {children.rows.map((row) => (
          <RowView
            key={row.id}
            instance={row}
            selected={row.key === model.selected}
          />
        ))}
      </ul>
    </section>
  );
});

const LIST = 'List';
const HEADER = 'List/header#1';
const row = (key: string, generation = 1) => `List/rows[${key}]#${generation}`;

describe('targeted rendering', () => {
  it('draws each Instance once on mount', async () => {
    await mount(<ListApp />);
    expect(renders).toEqual({
      [LIST]: 1,
      [HEADER]: 1,
      [row('a')]: 1,
      [row('b')]: 1,
      [row('c')]: 1,
    });
  });

  it('a Child Message renders only that Child', async () => {
    await mount(<ListApp />);
    renders = {};
    await send(row('b'), { _tag: 'Bumped' });
    expect(renders).toEqual({ [row('b')]: 1 });
    expect(host.textContent).toContain('b:1');
  });

  it("a parent's change that its Children do not see renders only the parent", async () => {
    await mount(<ListApp />);
    renders = {};
    await send(LIST, { _tag: 'Retitled', title: 'Renamed' });
    expect(renders).toEqual({ [LIST]: 1 });
  });

  it('a prop renders only the Children whose prop changed', async () => {
    await mount(<ListApp />);
    renders = {};
    await send(LIST, { _tag: 'Selected', id: 'c' });
    expect(renders).toEqual({ [LIST]: 1, [row('a')]: 1, [row('c')]: 1 });
  });

  it('a new key renders the parent and the new Child only', async () => {
    await mount(<ListApp />);
    renders = {};
    await send(LIST, { _tag: 'Added' });
    expect(renders).toEqual({ [LIST]: 1, [row('n0')]: 1 });
  });

  it('keeps the same children while their IDs do not change', async () => {
    const seen: Array<unknown> = [];
    const Watch = View.make(List, (self) => {
      drew(self);
      seen.push(self.children.rows);
      return null;
    });
    const App = toReact(List, Watch, Layer.empty);
    await act(async () => root.render(<App />));
    await act(() => new Promise((done) => setTimeout(done, 0)));
    await send(LIST, { _tag: 'Retitled', title: 'Renamed' });
    await send(LIST, { _tag: 'Added' });
    expect(seen).toHaveLength(3);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[1]);
  });

  it('Handles carry the key from the Model', async () => {
    let keys: ReadonlyArray<string | undefined> = [];
    const Keys = View.make(List, ({ children }) => {
      keys = children.rows.map((kid) => kid.key);
      return null;
    });
    const App = toReact(List, Keys, Layer.empty);
    await act(async () => root.render(<App />));
    await act(() => new Promise((done) => setTimeout(done, 0)));
    expect(keys).toEqual(['a', 'b', 'c']);
  });
});

/** A fresh Runtime for every test, so tests do not share an app. */
const ListApp = () => {
  const [App] = useState(() => toReact(List, ListView, Layer.empty));
  return <App />;
};

// One draw function across States ---------------------------------------------------

const Editor = Actor.make('Editor', {
  model: Schema.Struct({ draft: Schema.String }),
  state: Schema.TaggedUnion({
    Editing: {},
    Saving: { since: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Typed: { text: Schema.String },
    Saved: {},
  }),
}).build({
  init: () => ({ model: { draft: '' }, state: { _tag: 'Editing' } }),
  update: {
    Editing: {
      Typed: ({ text }) => ({ model: { draft: text } }),
      Saved: (_, { at }) => ({ state: { _tag: 'Saving', since: at } }),
    },
  },
});

const EditorView = View.make(Editor, (self) => {
  drew(self);
  const { _tag, state, model } = self;
  return (
    <form>
      <input value={model.draft} readOnly />
      {_tag === 'Saving' ? <p>saving since {state.since}</p> : <p>editing</p>}
    </form>
  );
});

describe('one draw function', () => {
  it('keeps the DOM across a Transition', async () => {
    const App = toReact(Editor, EditorView, Layer.empty);
    await mount(<App />);
    const input = host.querySelector('input');
    await send('Editor', { _tag: 'Typed', text: 'hi' });
    await send('Editor', { _tag: 'Saved' });
    expect(host.textContent).toContain('saving since');
    expect(host.querySelector('input')).toBe(input);
    expect(input?.value).toBe('hi');
  });
});

// root: ref and style -----------------------------------------------------------------

describe('root', () => {
  it("hands the parent's ref to the element the View spreads it on", async () => {
    let seen: Element | null = null;
    const Parent = View.make(List, (self) => {
      drew(self);
      const { children } = self;
      const ref = useRef<HTMLLIElement>(null);
      seen = ref.current;
      return (
        <ul>
          <RowView instance={children.rows[0]!} ref={ref} selected={false} />
        </ul>
      );
    });
    const App = toReact(List, Parent, Layer.empty);
    await mount(<App />);
    await send(LIST, { _tag: 'Retitled', title: 'again' });
    expect(seen).toBeInstanceOf(HTMLLIElement);
  });

  it('lets motion.create animate a View', async () => {
    const MotionRow = motion.create(RowView);
    const Parent = View.make(List, ({ children }) => (
      <ul>
        <MotionRow
          instance={children.rows[0]!}
          selected={false}
          initial={{ opacity: 0.25 }}
        />
      </ul>
    ));
    const App = toReact(List, Parent, Layer.empty);
    await mount(<App />);
    expect(host.querySelector('li')?.style.opacity).toBe('0.25');
  });
});

// Exit: a stopped Instance keeps its last data ------------------------------------

const MotionRow = motion.create(RowView);

const ExitView = View.make(List, (self) => {
  drew(self);
  return (
    <ul>
      <AnimatePresence>
        {self.children.rows.map((kid) => (
          <MotionRow
            key={kid.id}
            instance={kid}
            selected={false}
            exit={{ opacity: 0, transition: { duration: 60 } }}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
});

describe('exit', () => {
  it('draws a stopped Instance with its last data while it exits', async () => {
    const App = toReact(List, ExitView, Layer.empty);
    await mount(<App />);
    await send(row('b'), { _tag: 'Bumped' });
    await send(LIST, { _tag: 'Removed', id: 'b' });
    expect(host.querySelectorAll('li')).toHaveLength(3);
    expect(host.textContent).toContain('b:1');
  });

  it('draws nothing for a stopped Instance outside AnimatePresence', async () => {
    const App = toReact(List, ListView, Layer.empty);
    await mount(<App />);
    await send(LIST, { _tag: 'Removed', id: 'b' });
    expect(host.querySelectorAll('li')).toHaveLength(2);
    expect(host.textContent).not.toContain('b:');
  });
});

// motion.create keeps memo ----------------------------------------------------------

const SelectView = View.make(List, (self) => {
  drew(self);
  return (
    <ul>
      {self.children.rows.map((kid) => (
        <MotionRow
          key={kid.id}
          instance={kid}
          selected={kid.key === self.model.selected}
          animate={{ opacity: 1 }}
        />
      ))}
    </ul>
  );
});

describe('motion.create and memo', () => {
  it('does not draw the View again when only its parent renders', async () => {
    const App = toReact(List, ExitView, Layer.empty);
    await mount(<App />);
    renders = {};
    await send(LIST, { _tag: 'Retitled', title: 'Renamed' });
    expect(renders).toEqual({ [LIST]: 1 });
  });

  it('draws it again when a prop changes', async () => {
    const App = toReact(List, SelectView, Layer.empty);
    await mount(<App />);
    renders = {};
    await send(LIST, { _tag: 'Selected', id: 'b' });
    expect(renders).toEqual({ [LIST]: 1, [row('a')]: 1, [row('b')]: 1 });
  });

  it('draws it again when a value in `style` changes', async () => {
    const Styled = View.make(List, (self) => {
      drew(self);
      return (
        <ul>
          <RowView
            instance={self.children.rows[0]!}
            selected={false}
            style={{ opacity: self.model.title.length / 10 }}
          />
        </ul>
      );
    });
    const App = toReact(List, Styled, Layer.empty);
    await mount(<App />);
    renders = {};
    await send(LIST, { _tag: 'Retitled', title: 'Lis' });
    await send(LIST, { _tag: 'Retitled', title: 'Lis' });
    expect(renders).toEqual({ [LIST]: 2, [row('a')]: 1 });
  });
});

// Types ---------------------------------------------------------------------------------

export const types = () => {
  // A switch on `_tag` narrows `state` and `children` together.
  View.make(Editor, ({ _tag, state }) =>
    _tag === 'Saving' ? state.since : null,
  );
  View.make(
    Editor,
    ({ state }) =>
      // @ts-expect-error `since` exists only in Saving
      state.since,
  );
  // @ts-expect-error props are data: a function is not one
  View.make(
    Row,
    ({ id }, { onPick }: { readonly onPick: () => void }) => id + onPick.name,
  );
  // @ts-expect-error `instance` belongs to the View
  View.make(Row, ({ id }, { instance }: { readonly instance: string }) =>
    instance === id ? id : null,
  );
  const self = null! as ViewProps<typeof Row>;
  const RowAlone = View.make(Row, () => null);
  return [
    self.root,
    // @ts-expect-error a View with props needs them
    <RowView instance={{ id: 'x' }} />,
    <RowAlone instance={{ id: 'x' }} />,
    // @ts-expect-error a View without props takes none
    <RowAlone instance={{ id: 'x' }} selected />,
  ];
};
