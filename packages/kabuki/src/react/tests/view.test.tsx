// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Actor } from '../../core/index.ts';
import { View, toReact, useChild, useChildren } from '../index.ts';
import type { Handle, ViewProps } from '../index.ts';
import { registry } from '../registry.ts';

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
  registry.clear();
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

const Row = Actor.build(
  Actor.define('Row', {
    input: Schema.Struct({ text: Schema.String }),
    props: Schema.Struct({ selected: Schema.Boolean }),
    model: Schema.Struct({ text: Schema.String, bumps: Schema.Number }),
    message: Schema.TaggedUnion({ Bumped: {} }),
  }),
  {
    init: ({ text }) => ({ model: { text, bumps: 0 } }),
    on: {
      Bumped: (_, { model }) => ({
        model: { ...model, bumps: model.bumps + 1 },
      }),
    },
  },
);

const RowView = View.make(Row, (self) => {
  drew(self);
  return (
    <li {...self.root} data-selected={self.props.selected}>
      {self.model.text}:{self.model.bumps}
    </li>
  );
});

const Header = Actor.build(
  Actor.define('Header', {
    model: Schema.Struct({ clicks: Schema.Number }),
    message: Schema.TaggedUnion({ Clicked: {} }),
  }),
  {
    init: () => ({ model: { clicks: 0 } }),
    on: {
      Clicked: (_, { model }) => ({ model: { clicks: model.clicks + 1 } }),
    },
  },
);

const HeaderView = View.make(Header, (self) => {
  drew(self);
  return <h1>{self.model.clicks}</h1>;
});

// A list with a fixed Child and keyed Children ------------------------------------

const List = Actor.build(
  Actor.define('List', {
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
  }),
  {
    init: () => ({
      model: { ids: ['a', 'b', 'c'], next: 0, selected: 'a', title: 'List' },
    }),
    children: {
      header: { actor: Header },
      rows: {
        actor: Row,
        each: ({ model }) => model.ids,
        input: (_, id) => ({ text: id }),
        props: ({ model }, id) => ({ selected: id === model.selected }),
      },
    },
    on: {
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
  },
);

const ListView = View.make(List, (self) => {
  drew(self);
  const { model, children } = self;
  return (
    <section>
      <h2>{model.title}</h2>
      <HeaderView instance={children.header} />
      <ul>
        {children.rows.map((row) => (
          <RowView key={row.id} instance={row} />
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

  it('new Props render only the Children whose Props changed', async () => {
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

// A parent View reading its Children -------------------------------------------------

/** Every Row's bumps, summed: re-renders on its own as a Row changes. */
const Bumps = ({
  rows,
}: {
  readonly rows: ReadonlyArray<Handle<typeof Row>>;
}) => {
  const read = useChildren(rows);
  renders.Bumps = (renders.Bumps ?? 0) + 1;
  seenRows = read;
  return <p>bumps:{read.reduce((sum, kid) => sum + kid.model.bumps, 0)}</p>;
};

/** Which Row is selected, picked from each: re-renders only as that changes. */
const Selected = ({
  rows,
}: {
  readonly rows: ReadonlyArray<Handle<typeof Row>>;
}) => {
  const selected = useChildren(rows, (kid) => kid.props.selected);
  renders.Selected = (renders.Selected ?? 0) + 1;
  return <p>selected:{selected.join(',')}</p>;
};

/** Whether the Header was clicked more than once: re-renders only as that changes. */
const Busy = ({ header }: { readonly header: Handle<typeof Header> }) => {
  const busy = useChild(header, (read) => read.model.clicks > 1);
  renders.Busy = (renders.Busy ?? 0) + 1;
  return <p>busy:{String(busy)}</p>;
};

const Clicks = ({ header }: { readonly header: Handle<typeof Header> }) => {
  const read = useChild(header);
  return <p>clicks:{read?.model.clicks}</p>;
};

let seenRows: ReadonlyArray<object> = [];

const ReadingView = View.make(List, (self) => {
  drew(self);
  const { children } = self;
  return (
    <section>
      <Bumps rows={children.rows} />
      <Clicks header={children.header} />
      <Selected rows={children.rows} />
      <Busy header={children.header} />
      <HeaderView instance={children.header} />
      <ul>
        {children.rows.map((kid) => (
          <RowView key={kid.id} instance={kid} />
        ))}
      </ul>
    </section>
  );
});

const ReadingApp = () => {
  const [App] = useState(() => toReact(List, ReadingView, Layer.empty));
  return <App />;
};

describe('a parent View reading its Children', () => {
  it('re-renders only the component that reads, never the parent View', async () => {
    await mount(<ReadingApp />);
    renders = {};
    await send(row('b'), { _tag: 'Bumped' });
    await send(row('c'), { _tag: 'Bumped' });
    expect(host.textContent).toContain('bumps:2');
    expect(renders).toEqual({ Bumps: 2, [row('b')]: 1, [row('c')]: 1 });
  });

  it('given a selector, re-renders only when what it picks changes', async () => {
    await mount(<ReadingApp />);
    renders = {};
    await send(row('b'), { _tag: 'Bumped' });
    await send(HEADER, { _tag: 'Clicked' });
    expect(renders.Selected).toBeUndefined();
    expect(renders.Busy).toBeUndefined();

    // The second click turns what Busy picks to true.
    await send(HEADER, { _tag: 'Clicked' });
    expect(renders.Busy).toBe(1);
    expect(renders.Selected).toBeUndefined();
    expect(host.textContent).toContain('busy:true');
  });

  it('reads a fixed Child', async () => {
    await mount(<ReadingApp />);
    await send(HEADER, { _tag: 'Clicked' });
    expect(host.textContent).toContain('clicks:1');
  });

  it('reads, and never Sends or reaches further down', async () => {
    await mount(<ReadingApp />);
    expect(Object.keys(seenRows[0]!).sort()).toEqual([
      '_tag',
      'id',
      'model',
      'props',
      'state',
    ]);
  });

  it('follows the slot as keys come and go, and stays the same list while none change', async () => {
    await mount(<ReadingApp />);
    const before = seenRows;
    await send(LIST, { _tag: 'Retitled', title: 'Renamed' });
    expect(seenRows).toBe(before);
    await send(LIST, { _tag: 'Removed', id: 'a' });
    expect(seenRows.map((kid) => (kid as { id: string }).id)).toEqual([
      row('b'),
      row('c'),
    ]);
  });

  it('throws outside an app', () => {
    const Lost = () => {
      useChild({ id: 'nowhere' });
      return null;
    };
    expect(() => {
      act(() => root.render(<Lost />));
    }).toThrow('useChild is used outside its app');
  });
});

// One draw function across States ---------------------------------------------------

const Editor = Actor.build(
  Actor.define('Editor', {
    model: Schema.Struct({ draft: Schema.String }),
    state: Schema.TaggedUnion({
      Editing: {},
      Saving: { since: Schema.Number },
    }),
    message: Schema.TaggedUnion({
      Typed: { text: Schema.String },
      Saved: {},
    }),
  }),
  {
    init: () => ({ model: { draft: '' }, state: { _tag: 'Editing' } }),
    state: {
      Editing: {
        on: {
          Typed: ({ text }) => ({ model: { draft: text } }),
          Saved: (_, { at }) => ({ state: { _tag: 'Saving', since: at } }),
        },
      },
    },
  },
);

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
          <RowView instance={children.rows[0]!} ref={ref} />
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
        <MotionRow instance={children.rows[0]!} initial={{ opacity: 0.25 }} />
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
        <MotionRow key={kid.id} instance={kid} animate={{ opacity: 1 }} />
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

  it('draws it again when its Props change', async () => {
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
  // A View reads the Props its parent Actor hands it, typed by the Actor.
  View.make(Row, ({ props }) => (props.selected ? 'on' : 'off'));
  View.make(
    Row,
    ({ props }) =>
      // @ts-expect-error Row's Props have no `title`
      props.title,
  );
  // A Child is always there, there or not `while` its test holds, or a list of `each`.
  const Lamp = Actor.build(
    Actor.define('Lamp', {
      model: Schema.Struct({ on: Schema.Boolean }),
    }),
    {
      init: () => ({ model: { on: false } }),
      children: {
        header: { actor: Header },
        shade: { actor: Header, while: ({ model }) => model.on },
        rows: {
          actor: Row,
          each: () => ['a'],
          input: (_, id) => ({ text: id }),
          props: () => ({ selected: false }),
        },
      },
    },
  );
  View.make(Lamp, ({ children }) => [
    children.header.id,
    children.shade?.id,
    children.rows.map((row) => row.key),
    // @ts-expect-error `shade` is there only while its test holds
    children.shade.id,
  ]);
  const self = null! as ViewProps<typeof Row>;
  return [
    self.root,
    <RowView instance={{ id: 'x' }} />,
    // @ts-expect-error a parent View hands only where to draw: data is Props
    <RowView instance={{ id: 'x' }} selected />,
  ];
};
