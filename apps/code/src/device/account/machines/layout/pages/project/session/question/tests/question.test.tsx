// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import {
  type AgentQuestion,
  CodeClient,
  HarnessFailed,
  QuestionNotAsked,
  type SessionQuestions,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { toReact, useChild, View } from '@kestack/kabuki/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../../commands.ts';
import { Machines } from '../../../../../../machines.ts';
import { Question } from '../index.ts';
import QuestionView from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Question Panel worked by keys alone, as a session's page draws it:
 * in the Draft's place, which is not drawn while a question stands in for
 * it, beside a sidebar. A question opens expanded, its first choice
 * focused; `j`, `l`, Space, a number and `i` answer every Item, Escape
 * leaves a field and then minimises it. Minimised, the page's keys scroll
 * the transcript, and `i` or `y` open it again, never the Draft. Ctrl+H
 * still goes to the sidebar from it. Sending with an Item left marks it
 * and sends nothing; once all are answered, Mod+Enter sends. The Machine
 * is stood in for: its Agent Questions come from the test, and what is
 * answered is only noted.
 */

type Api = CodeClient['Service'];

const QUESTION: AgentQuestion = {
  id: 'q1',
  askedAt: 0,
  items: [
    {
      id: 'a',
      header: 'Auth',
      question: 'Which way should users sign in?',
      options: [
        { label: 'Link', description: 'By email.' },
        { label: 'Passkey', description: 'Passkey' },
      ],
      multiSelect: false,
      other: true,
      secret: false,
    },
    {
      id: 'b',
      header: 'Checks',
      question: 'Which checks run?',
      options: [
        { label: 'Types', description: '' },
        { label: 'Lint', description: '' },
      ],
      multiSelect: true,
      other: false,
      secret: false,
    },
    {
      id: 'c',
      header: 'Token',
      question: 'Paste the token',
      options: [],
      multiSelect: false,
      other: true,
      secret: true,
    },
  ],
};

const asking = (questions: ReadonlyArray<AgentQuestion>): SessionQuestions => ({
  sessionId: 's1',
  projectId: 'p1',
  questions,
});

let feed: Queue.Queue<ReadonlyArray<SessionQuestions>>;
let answered: Array<unknown> = [];
/** How the Machine takes the next answer: as asked, or refusing it. */
let takes: 'yes' | 'gone' | 'fails' = 'yes';
let written = 0;
let scrolled = 0;
let stepped = 0;
let pings = 0;
let ping = () => {};
/** Whether the page is in Vim Mode, as the next render draws it. */
let vim = true;
let where = () => '';

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    question: {
      actor: Question.actor,
      props: () => ({ machineId: 'm1', sessionId: 's1' }),
    },
  },
  on: { Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }) },
});

/** The Draft, drawn only while no question stands in for it. */
function Draft() {
  keys.useAction('content.write', () => void written++);
  return <textarea data-testid="draft" />;
}

/** The sidebar beside the page, with a key of its own. */
function Sidebar() {
  keys.useAction('sidebar.next', () => void stepped++);
  return (
    <keys.Surface id="sidebar">
      <button type="button" data-testid="sidebar">
        A session
      </button>
    </keys.Surface>
  );
}

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim={vim}>
      <Page instance={children.question} />
    </keys.Provider>
  );
});

function Page({
  instance,
}: {
  readonly instance: Parameters<typeof QuestionView>[0]['instance'];
}) {
  const [place, setPlace] = useState<HTMLElement | null>(null);
  const asked =
    useChild(instance, ({ model }) => Question.shownOf(model) !== null) ===
    true;
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  keys.useAction('content.down', () => void scrolled++);
  const keyboard = keys.useKeyboard();
  where = () => keyboard.active;
  return (
    <>
      <Sidebar />
      <keys.Surface id="content">
        <div style={{ position: 'relative' }}>
          <div ref={spot} tabIndex={-1} data-testid="page" />
          <div ref={setPlace} className="contents" />
          <Question.Around
            value={{ place, agent: 'Claude', stop: null, problem: null }}
          >
            <QuestionView instance={instance} />
          </Question.Around>
          {!asked && <Draft />}
        </div>
      </keys.Surface>
    </>
  );
}

const services = Layer.mergeAll(
  Layer.mock(CodeClient)({
    answerQuestion: ((args: { readonly questionId: string }) =>
      takes === 'gone'
        ? Effect.fail(new QuestionNotAsked({ id: args.questionId }))
        : takes === 'fails'
          ? Effect.fail(new HarnessFailed({ message: 'The agent is gone' }))
          : Effect.sync(
              () => void answered.push(args),
            )) as unknown as Api['answerQuestion'],
  }),
  Layer.mock(Machines)({
    questions: () => Stream.fromQueue(feed),
  }),
);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? { metaKey: true } : { ctrlKey: true };

const key = async (name: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  const code =
    name === ' '
      ? 'Space'
      : /^[a-z]$/.test(name)
        ? `Key${name.toUpperCase()}`
        : /^\d$/.test(name)
          ? `Digit${name}`
          : name;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, code, bubbles: true, ...init }),
    );
  });
  await flush();
};

const ask = async (questions: ReadonlyArray<AgentQuestion>) => {
  await act(async () =>
    Effect.runPromise(Queue.offer(feed, [asking(questions)])),
  );
  await flush();
  await flush();
};

const choice = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-question-row]')].find(
    (each) => each.textContent?.startsWith(label),
  )!;
/** The field of the Item at `index`. */
const field = (index = 2) =>
  document.querySelector<HTMLInputElement>(
    `[data-question-item="${index}"] input[data-question-field]`,
  )!;
const bar = () =>
  document.querySelector<HTMLElement>('[data-slot="question-bar"]');
/** Whether it is drawn expanded, over the page. */
const expanded = () =>
  document.querySelector('[data-expanded] [data-question-item]') !== null;
const draft = () => document.querySelector('[data-testid="draft"]');

const typeInto = async (input: HTMLInputElement, text: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};

const rerender = async () => {
  await act(async () => ping());
  await flush();
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  document.documentElement.setAttribute('data-keyboard', '');
  answered = [];
  takes = 'yes';
  written = 0;
  scrolled = 0;
  stepped = 0;
  vim = true;
  feed = Effect.runSync(Queue.unbounded<ReadonlyArray<SessionQuestions>>());
  const App = toReact(OwnerLive, OwnerView, services, {
    name: `question-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await rerender();
  }
  expect(pings).toBeGreaterThan(0);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('the Question Panel, by keys', () => {
  it('stands in for the Draft, expanded, and answers every Item by keys alone', async () => {
    expect(draft()).not.toBeNull();
    await ask([QUESTION]);
    expect(draft()).toBeNull();
    expect(expanded()).toBe(true);
    expect(where()).toBe('question');
    expect(document.activeElement).toBe(choice('Link'));
    await key('j');
    expect(document.activeElement).toBe(choice('Passkey'));
    await key(' ');
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    await key('l');
    expect(document.activeElement).toBe(choice('Types'));
    await key('2');
    expect(choice('Lint').getAttribute('aria-checked')).toBe('true');
    await key('l');
    // A field alone is a row: `i` goes in, and it takes typing, `i` too.
    await key('i');
    expect(document.activeElement).toBe(field());
    expect(field().type).toBe('password');
    await key('j');
    await key('i');
    expect(document.activeElement).toBe(field());
    await typeInto(field(), 'ice');
    // Escape leaves the field for its row, still expanded.
    await key('Escape');
    expect(expanded()).toBe(true);
    expect(document.activeElement).not.toBe(field());
    await key('Enter', mod);
    expect(answered).toEqual([
      {
        sessionId: 's1',
        questionId: 'q1',
        answer: { a: ['Passkey'], b: ['Lint'], c: ['ice'] },
      },
    ]);
    // Answered: the Draft is back, and no key ever reached it.
    expect(draft()).not.toBeNull();
    expect(bar()).toBeNull();
    expect(written).toBe(0);
    expect(scrolled).toBe(0);
  });

  it('minimises on Escape, so the page’s keys scroll the transcript, and `i` opens it, never the Draft', async () => {
    await ask([QUESTION]);
    await key(' ');
    await key('Escape');
    expect(expanded()).toBe(false);
    expect(where()).toBe('content');
    // Focus is the page's again, so no key is lost on a hidden row.
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="page"]'),
    );
    expect(bar()?.textContent).toContain('Claude asks: Auth, Checks, Token');
    expect(bar()?.textContent).toContain('1 of 3 answered');
    expect(draft()).toBeNull();
    await key('j');
    await key('j');
    expect(scrolled).toBe(2);
    await key('i');
    expect(written).toBe(0);
    expect(expanded()).toBe(true);
    // Back as it was left, on the row it was left on.
    expect(choice('Link').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(choice('Link'));
  });

  it('toggles by `y`, and by Ctrl+Y out of Vim Mode, naming the key that works', async () => {
    await ask([QUESTION]);
    await key('y');
    expect(expanded()).toBe(false);
    expect(bar()?.textContent).toContain('Openy');
    await key('y');
    expect(expanded()).toBe(true);
    vim = false;
    await rerender();
    await key('y', { ctrlKey: true });
    expect(expanded()).toBe(false);
    expect(bar()?.textContent).toContain('Openctrl+y');
    await key('y', { ctrlKey: true });
    expect(expanded()).toBe(true);
  });

  it('leaves the sidebar working: Ctrl+H goes there from it, and its keys work', async () => {
    await ask([QUESTION]);
    await key('h', { ctrlKey: true });
    expect(where()).toBe('sidebar');
    await key('j');
    expect(stepped).toBe(1);
    // Still asked, and still expanded over the page alone.
    expect(expanded()).toBe(true);
  });

  it('says an option once when what it means is only its label', async () => {
    await ask([QUESTION]);
    expect(choice('Passkey').textContent).toBe('Passkey2');
    expect(choice('Link').textContent).toBe('LinkBy email.1');
  });

  it('sends nothing with an Item left, and says which', async () => {
    await ask([QUESTION]);
    await key(' ');
    await key('Enter', mod);
    expect(answered).toEqual([]);
    expect(document.body.textContent).toContain('Needs an answer');
    expect(document.activeElement).toBe(choice('Types'));
  });

  it('skips by `d`, opens the next expanded, and gives the Draft back once none is asked', async () => {
    await ask([QUESTION]);
    await key('y');
    await key('y');
    // Opened again by its key, it has the keys again.
    expect(where()).toBe('question');
    await key('d');
    expect(answered).toEqual([
      { sessionId: 's1', questionId: 'q1', answer: null },
    ]);
    await ask([QUESTION, { ...QUESTION, id: 'q2' }]);
    expect(expanded()).toBe(true);
    await ask([]);
    expect(expanded()).toBe(false);
    expect(bar()).toBeNull();
    expect(draft()).not.toBeNull();
  });

  it('keeps each question minimised or not while the session is open', async () => {
    await ask([QUESTION]);
    await key('Escape');
    expect(expanded()).toBe(false);
    // Asked again with another beside it: the one shown stays minimised.
    await ask([QUESTION, { ...QUESTION, id: 'q2' }]);
    expect(expanded()).toBe(false);
  });

  it('takes a question no longer asked as answered, and keeps one refused as it was', async () => {
    await ask([QUESTION]);
    takes = 'fails';
    await key('d');
    expect(expanded()).toBe(true);
    expect(bar()?.textContent).toContain('Skip');
    takes = 'gone';
    await key('d');
    // Answered elsewhere, or its Turn ended: the Draft is back at once.
    expect(bar()).toBeNull();
    expect(draft()).not.toBeNull();
  });
});
