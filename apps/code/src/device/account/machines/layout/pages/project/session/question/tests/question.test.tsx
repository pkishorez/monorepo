// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
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
import { type Answering, Machines } from '../../../../../../machines.ts';
import { answeringAsked } from '../../../../../../machine/records/index.ts';
import { Question } from '../index.ts';
import QuestionView from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Question Panel as a session's page draws it: in the Draft's place,
 * which is not drawn while a question stands in for it, beside a sidebar.
 * A question opens expanded, a dialog of one Item a step, its first
 * choice focused. By keys: `j` and `k` move, a single choice chosen as it
 * is reached; Ctrl+J and Ctrl+K step; Space, `x` and a number choose;
 * Enter goes on, or sends on the last; `i` edits one's own answer, and
 * Escape or Enter leave it; `q` asks to skip, and `q` or Enter again
 * skips; `m` or Escape minimise. Minimised, the page's keys scroll the
 * transcript, and `m` or `i` open it again, never the model Picker or the
 * Draft. Ctrl+H still goes to the sidebar from it. Sending with an Item
 * left marks it, goes to its step and sends nothing. By mouse and touch,
 * a click does what the keys do. Leaving the session and coming back
 * finds it as it was left. The Machine is stood in for: its Agent
 * Questions come from the test, it keeps how they are being answered
 * while each is asked, as the real one does, and what is answered is only
 * noted.
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

let feed: SubscriptionRef.SubscriptionRef<ReadonlyArray<SessionQuestions>>;
/** How the Machine keeps each Session's questions being answered. */
let kept: Readonly<Record<string, Answering>> = {};
let open = (_sessionId: string) => {};
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
/** Whether the Turn runs, so Stop is drawn, as the next render draws it. */
let running = false;
let stopped = 0;
let where = () => '';

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite, sessionId: Schema.String }),
  message: Schema.TaggedUnion({
    Ping: {},
    Opened: { sessionId: Schema.String },
  }),
});

/** The session's page: a Question Panel fresh for each session opened. */
const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0, sessionId: 's1' } }),
  children: {
    question: {
      actor: Question.actor,
      key: ({ model }) => model.sessionId,
      props: ({ model }) => ({ machineId: 'm1', sessionId: model.sessionId }),
    },
  },
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Opened: ({ sessionId }, { model }) => ({ model: { ...model, sessionId } }),
  },
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
  open = (sessionId) => send({ _tag: 'Opened', sessionId });
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
            value={{
              place,
              agent: 'Claude',
              harness: 'claude',
              stop: running
                ? {
                    run: () => void stopped++,
                    stopping: false,
                    disabled: false,
                    keys: 'mod+.',
                  }
                : null,
              problem: null,
            }}
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
    questions: () => SubscriptionRef.changes(feed),
    answering: (_, sessionId) => Effect.sync(() => kept[sessionId] ?? null),
    keepAnswering: (_, sessionId, answering) =>
      Effect.map(SubscriptionRef.get(feed), (questions) => {
        kept = answeringAsked({ ...kept, [sessionId]: answering }, questions);
      }),
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
  const all = [asking(questions)];
  kept = answeringAsked(kept, all);
  await act(async () => Effect.runPromise(SubscriptionRef.set(feed, all)));
  await flush();
  await flush();
};

const choice = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-question-row]')].find(
    (each) => each.textContent?.startsWith(label),
  )!;
/** One's own answer, as a row or, while edited, its field's frame. */
const own = () => document.querySelector<HTMLElement>('[data-other]')!;
const field = () =>
  document.querySelector<HTMLInputElement>('input[data-question-field]');
/** The step shown: its Item's index. */
const shownStep = () =>
  Number(
    document
      .querySelector<HTMLElement>('[data-expanded] [data-question-item]')
      ?.getAttribute('data-question-item') ?? -1,
  );
const bar = () =>
  document.querySelector<HTMLElement>('[data-slot="question-bar"]');
/** Whether it is drawn expanded, over the page. */
const expanded = () =>
  document.querySelector('[data-expanded] [data-question-item]') !== null;
const draft = () => document.querySelector('[data-testid="draft"]');
/** A button by its words, in the dialog or the bar. */
const button = (words: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((each) =>
    each.textContent?.startsWith(words),
  ) ?? null;
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
  await flush();
};
/** Stop, minimised in the bar or expanded at the dialog's head. */
const stopButton = (where: 'bar' | 'panel') =>
  [
    ...document.querySelectorAll<HTMLButtonElement>(
      where === 'bar'
        ? '[data-slot="question-bar"] button'
        : '[data-expanded] button',
    ),
  ].find((button) => button.title.startsWith('Stop the turn')) ?? null;

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
  running = false;
  stopped = 0;
  feed = Effect.runSync(
    SubscriptionRef.make<ReadonlyArray<SessionQuestions>>([]),
  );
  kept = {};
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
  it('stands in for the Draft, a step each, and answers every Item by keys alone', async () => {
    expect(draft()).not.toBeNull();
    await ask([QUESTION]);
    expect(draft()).toBeNull();
    expect(expanded()).toBe(true);
    expect(where()).toBe('question');
    expect(shownStep()).toBe(0);
    expect(document.activeElement).toBe(choice('Link'));
    // One choice: the option reached is chosen, as a radio group's arrows.
    await key('j');
    expect(document.activeElement).toBe(choice('Passkey'));
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    await key('k');
    expect(choice('Link').getAttribute('aria-checked')).toBe('true');
    await key('ArrowDown');
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    await key('j', { ctrlKey: true });
    expect(shownStep()).toBe(1);
    expect(document.activeElement).toBe(choice('Types'));
    // Several: moving chooses nothing; Space, `x` and a number do.
    await key('j');
    expect(choice('Lint').getAttribute('aria-checked')).toBe('false');
    await key('x');
    expect(choice('Lint').getAttribute('aria-checked')).toBe('true');
    await key('1');
    expect(choice('Types').getAttribute('aria-checked')).toBe('true');
    await key(' ');
    expect(choice('Types').getAttribute('aria-checked')).toBe('false');
    // Back a step, on the choice made.
    await key('k', { ctrlKey: true });
    expect(shownStep()).toBe(0);
    expect(document.activeElement).toBe(choice('Passkey'));
    await key('l');
    await key('Tab');
    expect(shownStep()).toBe(2);
    // An Item with no options is one row, edited by `i`.
    expect(field()).toBeNull();
    await key('i');
    expect(document.activeElement).toBe(field());
    expect(field()!.type).toBe('password');
    // Typing, `j` is typed, not a move.
    await key('j');
    expect(document.activeElement).toBe(field());
    await typeInto(field()!, 'ice');
    await key('Escape');
    expect(expanded()).toBe(true);
    expect(field()).toBeNull();
    expect(document.activeElement).toBe(own());
    // A secret said as dots.
    expect(own().textContent).toContain('•••');
    expect(own().textContent).not.toContain('ice');
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

  it('goes on by Enter, and sends by Enter on the last step', async () => {
    await ask([QUESTION]);
    expect(button('Next')).not.toBeNull();
    await key('j');
    await key('Enter');
    expect(shownStep()).toBe(1);
    await key(' ');
    await key('Enter');
    expect(shownStep()).toBe(2);
    expect(button('Send answers')).not.toBeNull();
    await key('Enter');
    await typeInto(field()!, 'ice');
    // Enter in the field leaves it and goes on: on the last, sends.
    await key('Enter');
    expect(answered).toEqual([
      {
        sessionId: 's1',
        questionId: 'q1',
        answer: { a: ['Passkey'], b: ['Types'], c: ['ice'] },
      },
    ]);
  });

  it('edits one’s own answer by `i`, leaves it by Escape, and goes on by Enter', async () => {
    await ask([QUESTION]);
    await key('j');
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    // A row like any other until edited.
    expect(field()).toBeNull();
    expect(own().textContent).toContain('Other…');
    await key('i');
    expect(document.activeElement).toBe(field());
    await typeInto(field()!, 'Magic words');
    // Typed, it is chosen, and the option let go.
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('false');
    await key('Escape');
    expect(field()).toBeNull();
    expect(document.activeElement).toBe(own());
    expect(own().textContent).toContain('Magic words');
    expect(own().getAttribute('aria-checked')).toBe('true');
    // Still expanded: Escape left the field, not the dialog.
    expect(expanded()).toBe(true);
    // Moving away chooses the option; back on it chooses what was typed.
    await key('k');
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    await key('j');
    expect(own().getAttribute('aria-checked')).toBe('true');
    // Enter on it edits it again; Enter in it goes on.
    await key('Enter');
    expect(document.activeElement).toBe(field());
    await key('Enter');
    expect(field()).toBeNull();
    expect(shownStep()).toBe(1);
  });

  it('minimises on `m` and Escape, so the page’s keys scroll the transcript, and `m` or `i` open it, never the Draft', async () => {
    await ask([QUESTION]);
    await key('j');
    await key('m');
    expect(expanded()).toBe(false);
    expect(where()).toBe('content');
    // Focus is the page's again, so no key is lost on a hidden row.
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="page"]'),
    );
    expect(bar()?.textContent).toContain('Claude asks · 1 of 3 answered');
    expect(bar()?.textContent).toContain('Openm');
    expect(draft()).toBeNull();
    await key('j');
    await key('j');
    expect(scrolled).toBe(2);
    await key('m');
    expect(expanded()).toBe(true);
    // Back as it was left, on the row it was left on.
    expect(document.activeElement).toBe(choice('Passkey'));
    await key('Escape');
    expect(expanded()).toBe(false);
    await key('i');
    expect(written).toBe(0);
    expect(expanded()).toBe(true);
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
  });

  it('works by its plain keys out of Vim Mode too, and toggles by Ctrl+Y', async () => {
    vim = false;
    await rerender();
    await ask([QUESTION]);
    await key('j');
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    await key('j', { ctrlKey: true });
    expect(shownStep()).toBe(1);
    await key('y', { ctrlKey: true });
    expect(expanded()).toBe(false);
    expect(bar()?.textContent).toContain('Openctrl+y');
    // Out of Vim Mode `m` on the page is no key.
    await key('m');
    expect(expanded()).toBe(false);
    await key('y', { ctrlKey: true });
    expect(expanded()).toBe(true);
    expect(shownStep()).toBe(1);
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

  it('takes the keys back from the sidebar while expanded, on the row it left', async () => {
    await ask([QUESTION]);
    await key('j');
    expect(document.activeElement).toBe(choice('Passkey'));
    await key('h', { ctrlKey: true });
    expect(where()).toBe('sidebar');
    // `l` goes to the page, which the dialog covers: the keys are its.
    await key('l');
    // The row is focused on the next frame.
    await act(() => new Promise((done) => requestAnimationFrame(done)));
    await flush();
    expect(where()).toBe('question');
    expect(document.activeElement).toBe(choice('Passkey'));
    await key('k');
    expect(document.activeElement).toBe(choice('Link'));
    expect(scrolled).toBe(0);
    // Minimised, the page keeps them.
    await key('Escape');
    expect(where()).toBe('content');
    await key('j');
    expect(scrolled).toBe(1);
  });

  it('says an option once when what it means is only its label', async () => {
    await ask([QUESTION]);
    expect(choice('Passkey').textContent).toBe('Passkey2');
    expect(choice('Link').textContent).toBe('LinkBy email.1');
  });

  it('sends nothing with an Item left, goes to its step, and says so', async () => {
    await ask([QUESTION]);
    await key('j');
    await key('Enter', mod);
    expect(answered).toEqual([]);
    expect(shownStep()).toBe(1);
    expect(document.body.textContent).toContain('Needs an answer');
    expect(document.activeElement).toBe(choice('Types'));
    expect(
      document.querySelector('[aria-label="Checks"][data-missing]'),
    ).not.toBeNull();
  });

  it('skips by `q` only once asked again, by `q` or Enter, and Escape lets it be', async () => {
    await ask([QUESTION]);
    await key('q');
    expect(answered).toEqual([]);
    expect(document.body.textContent).toContain('Skip this question?');
    await key('Escape');
    // Escape let go of skipping; it did not minimise.
    expect(expanded()).toBe(true);
    expect(document.body.textContent).not.toContain('Skip this question?');
    await key('q');
    await key('Enter');
    expect(answered).toEqual([
      { sessionId: 's1', questionId: 'q1', answer: null },
    ]);
    expect(draft()).not.toBeNull();
  });

  it('skips by `q` twice, opens the next expanded, and gives the Draft back once none is asked', async () => {
    await ask([QUESTION]);
    await key('m');
    await key('m');
    // Opened again by its key, it has the keys again.
    expect(where()).toBe('question');
    await key('q');
    await key('q');
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

  it('finds each answer so far, and minimised, after leaving the session and coming back', async () => {
    await ask([QUESTION]);
    await key('j');
    await key('l');
    await key('2');
    await key('Escape');
    expect(bar()?.textContent).toContain('2 of 3 answered');
    // Another session in the sidebar, then back: a fresh panel each time.
    await act(async () => open('s2'));
    await flush();
    expect(bar()).toBeNull();
    await act(async () => open('s1'));
    await flush();
    await flush();
    expect(expanded()).toBe(false);
    expect(bar()?.textContent).toContain('2 of 3 answered');
    await key('i');
    // Opened on the first step left.
    expect(shownStep()).toBe(2);
    await key('h');
    expect(choice('Lint').getAttribute('aria-checked')).toBe('true');
    await key('h');
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the Items left marked, and one sent unshown, after leaving and coming back', async () => {
    await ask([QUESTION]);
    await key(' ');
    await key('Enter', mod);
    expect(document.body.textContent).toContain('Needs an answer');
    await act(async () => open('s2'));
    await flush();
    await act(async () => open('s1'));
    await flush();
    await flush();
    expect(document.body.textContent).toContain('Needs an answer');
    // Skipped, but still listed while the Machine catches up: not shown again.
    await key('q');
    await key('q');
    expect(draft()).not.toBeNull();
    await act(async () => open('s2'));
    await flush();
    await act(async () => open('s1'));
    await flush();
    await flush();
    expect(bar()).toBeNull();
    expect(expanded()).toBe(false);
    expect(draft()).not.toBeNull();
  });

  it('lets what was kept of a question go once it is no longer asked', async () => {
    await ask([QUESTION]);
    await key(' ');
    await key('Escape');
    expect(kept['s1']?.drafts['q1']).toBeDefined();
    await act(async () => open('s2'));
    await flush();
    // Its Turn ended while elsewhere, then the agent asked it again.
    await ask([]);
    expect(kept).toEqual({});
    await ask([QUESTION]);
    await act(async () => open('s1'));
    await flush();
    await flush();
    expect(expanded()).toBe(true);
    expect(choice('Link').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps each question minimised or not while it is asked', async () => {
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
    await key('q');
    await key('q');
    expect(expanded()).toBe(true);
    expect(bar()?.textContent).toContain('Skip');
    takes = 'gone';
    // Refused, skipping is asked again.
    await key('q');
    await key('q');
    // Answered elsewhere, or its Turn ended: the Draft is back at once.
    expect(bar()).toBeNull();
    expect(draft()).not.toBeNull();
  });

  it('stops the Turn by mouse or touch, minimised or expanded, only while it runs', async () => {
    await ask([QUESTION]);
    expect(stopButton('panel')).toBeNull();
    running = true;
    await rerender();
    const inPanel = stopButton('panel')!;
    expect(inPanel.title).toBe('Stop the turn (mod+.)');
    await act(async () => inPanel.click());
    expect(stopped).toBe(1);
    await key('Escape');
    expect(expanded()).toBe(false);
    const inBar = stopButton('bar')!;
    // Named for those who cannot see its icon on a phone.
    expect(inBar.getAttribute('aria-label')).toBe('Stop the turn');
    await act(async () => inBar.click());
    expect(stopped).toBe(2);
    // Still asked: stopping is the Machine's to do, not the panel's.
    expect(bar()).not.toBeNull();
    expect(answered).toEqual([]);
  });
});

describe('the Question Panel, by mouse and touch', () => {
  it('answers by clicks: a choice, Next, a segment, Back, one’s own answer, and Send', async () => {
    await ask([QUESTION]);
    await click(choice('Passkey'));
    expect(choice('Passkey').getAttribute('aria-checked')).toBe('true');
    // A click chooses; it never goes on by itself.
    expect(shownStep()).toBe(0);
    expect(button('Back')).toBeNull();
    await click(button('Next')!);
    expect(shownStep()).toBe(1);
    await click(choice('Types'));
    await click(choice('Lint'));
    await click(choice('Types'));
    expect(choice('Types').getAttribute('aria-checked')).toBe('false');
    expect(choice('Lint').getAttribute('aria-checked')).toBe('true');
    // Each segment goes to its step, and says whether it is answered.
    const token = document.querySelector<HTMLElement>('[aria-label="Token"]')!;
    expect(
      document.querySelector('[aria-label="Checks, answered"]'),
    ).not.toBeNull();
    await click(token);
    expect(shownStep()).toBe(2);
    await click(button('Back')!);
    expect(shownStep()).toBe(1);
    await click(button('Next')!);
    // A click on the row makes it a field, focused in the same tap.
    await click(own());
    expect(document.activeElement).toBe(field());
    await typeInto(field()!, 'ice');
    await click(button('Send answers')!);
    expect(answered).toEqual([
      {
        sessionId: 's1',
        questionId: 'q1',
        answer: { a: ['Passkey'], b: ['Lint'], c: ['ice'] },
      },
    ]);
  });

  it('skips only once asked again, and minimises by a click behind it', async () => {
    await ask([QUESTION]);
    await click(button('Skip question')!);
    expect(answered).toEqual([]);
    await click(button('Cancel')!);
    expect(document.body.textContent).not.toContain('Skip this question?');
    await click(
      document.querySelector<HTMLElement>('[data-slot="question-backdrop"]')!,
    );
    expect(expanded()).toBe(false);
    await click(button('Open')!);
    expect(expanded()).toBe(true);
    await click(button('Skip question')!);
    await click(button('Skip')!);
    expect(answered).toEqual([
      { sessionId: 's1', questionId: 'q1', answer: null },
    ]);
  });

  it('says one question as “Send answer”, and minimised, its header', async () => {
    await ask([{ ...QUESTION, items: [QUESTION.items[0]!] }]);
    expect(button('Send answer')).not.toBeNull();
    expect(button('Next')).toBeNull();
    expect(document.querySelector('nav[aria-label="Questions"]')).toBeNull();
    await key('m');
    expect(bar()?.textContent).toContain('Claude asks · Auth');
  });
});
