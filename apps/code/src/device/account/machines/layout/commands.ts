import { describe } from '@kestack/use-keys';
import {
  type ActionId,
  createKeys,
  type Definition,
} from '@kestack/use-keys/surfaces';
import { useCallback, useRef } from 'react';

/*
 * The app's whole keyboard: every Surface, as they nest, and every key.
 * Vim Mode is off until turned on, by Mod+Alt+V or in Settings. Off, the
 * app is worked as any other: the Draft is a text box, plain keys type,
 * and only the Actions marked `always`, each holding Ctrl, Alt or Cmd, and
 * the Pickers' keys, work. On, plain keys work in Normal Mode too, and
 * only the Actions marked `inField` work while typing in the Composer or a
 * Picker's search; every one of those is `always` as well. In either Mode
 * Ctrl+P, Ctrl+J and Ctrl+K open the Project Picker, the Session Switcher
 * and Actions, Ctrl+N starts a new session and Ctrl+B shows or
 * hides the sidebar. In Vim Mode two Surfaces are places to work: the sidebar and the page beside it, `h`
 * and `l` going between them. The page is one Surface for every place, and
 * its Draft is part of it: `i` makes it the Composer, and Escape leaves the
 * Composer for the page's Normal Mode, where Enter sends the Draft, `u`
 * undoes the last thing put in it, and `/` puts a Skill in at its cursor.
 * A session gives the page the transcript's keys while it is open. `o`,
 * `s` and `a` open the Project Picker, the Session Switcher and
 * Actions; `m`, `p` and `e` the model Picker at the model, the permissions
 * and the effort. Space starts or stops a Dictation, and `d` opens the
 * Microphone Picker, to choose what it records from; `t` switches the
 * theme. The Ctrl keys above,
 * `Ctrl+,`, Settings and back, Mod+., stopping the turn, Ctrl+Space, a Dictation
 * again, Ctrl+H and Ctrl+L, the sidebar and the page, Ctrl+[ and Ctrl+],
 * the session before and after in the sidebar, Ctrl+O and Ctrl+I, Back and
 * Forward, and Page Up and Page Down work while typing too; Ctrl+Space
 * works in a Picker as well, and Escape never touches a Dictation. Escape in
 * the sidebar goes back to the page. Every Picker, those three, the skills,
 * the model, the microphone, and Actions opened by `?` in Vim Mode
 * or Ctrl+? in either, listing every key too, is drawn on the one isolated `picker` Surface: drawn
 * while Active, it closes when left and goes back to where it was opened
 * from, focus too. A Picker's keys are its
 * Surface's Actions, taken before cmdk hears them. Settings has no keys of
 * its own: recording a new key for an Action enters the isolated `record`
 * Surface, which has none, so no key works until it is pressed; Escape
 * leaves it, which cancels. A confirmation, such as removing a project, is
 * drawn on the isolated `confirm` Surface, so leaving it puts focus back
 * where it was.
 *
 * While the open session's agent waits on an Agent Question, the Question
 * Panel stands in for the Draft. Ctrl+Y, or `y` in Vim Mode, opens it or
 * minimises it, and `i` opens it, never the Composer. Open, it is the
 * `question` Surface, inside the page, so the sidebar and the Pickers'
 * keys still work from it: the arrows, or `j` and `k`, move through its
 * choices, Left and Right, or `h` and `l`, through its questions, Space
 * chooses, Enter chooses and goes on, 1 to 9 choose an option, `i` types an
 * answer of one's own, Mod+Enter sends, `d` skips it, and Escape leaves
 * what is typed, then minimises it. Minimised, the page's keys work on the
 * transcript as ever.
 *
 * Held down, a key that moves or scrolls does it again and again, as `j`
 * scrolls and `]` steps through the sessions (`repeat: true`); any other
 * key does its Action once.
 *
 * The Composer's editor takes its own keys first, so it hands the page the
 * `inField` ones. Actions without `enters` work only while a component
 * gives them a Handler.
 */

export const keys = createKeys({
  app: {
    label: 'anywhere',
    focusable: false,
    actions: {
      vim: {
        keys: 'mod+alt+v',
        label: 'Turn Vim Mode on or off',
        always: true,
        inField: true,
      },
      help: {
        keys: '?',
        label: 'Show the keys',
      },
      helpAnywhere: {
        keys: 'ctrl+?',
        label: 'Show the keys, even while typing',
        always: true,
        inField: true,
      },
      side: { keys: 'h', label: 'Go to the sidebar', enters: 'sidebar' },
      page: { keys: 'l', label: 'Go to the page', enters: 'content' },
      sideAnywhere: {
        keys: 'ctrl+h',
        label: 'Go to the sidebar, even while typing',
        always: true,
        enters: 'sidebar',
        inField: true,
      },
      pageAnywhere: {
        keys: 'ctrl+l',
        label: 'Go to the page, even while typing',
        always: true,
        enters: 'content',
        inField: true,
      },
      previousSession: {
        keys: 'ctrl+[',
        label: 'Previous session in the sidebar, even while typing',
        always: true,
        inField: true,
        repeat: true,
      },
      nextSession: {
        keys: 'ctrl+]',
        label: 'Next session in the sidebar, even while typing',
        always: true,
        inField: true,
        repeat: true,
      },
      back: {
        keys: 'ctrl+o',
        label: 'Back to the last page',
        always: true,
        inField: true,
      },
      forward: {
        keys: 'ctrl+i',
        label: 'Forward again',
        always: true,
        inField: true,
      },
      projects: { keys: 'o', label: 'Open a project' },
      projectsAnywhere: {
        keys: 'ctrl+p',
        label: 'Open a project, even while typing',
        always: true,
        inField: true,
      },
      sessions: { keys: 's', label: 'Switch session' },
      sessionsAnywhere: {
        keys: 'ctrl+j',
        label: 'Switch session, even while typing',
        always: true,
        inField: true,
      },
      actions: { keys: 'a', label: 'Session actions' },
      actionsAnywhere: {
        keys: 'ctrl+k',
        label: 'Session actions, even while typing',
        always: true,
        inField: true,
      },
      newSession: {
        keys: 'n',
        label: 'New session in this project',
      },
      newSessionAnywhere: {
        keys: 'ctrl+n',
        label: 'New session in this project, even while typing',
        always: true,
        inField: true,
      },
      sidebar: { keys: 'b', label: 'Show or hide the sidebar' },
      sidebarAnywhere: {
        keys: 'ctrl+b',
        label: 'Show or hide the sidebar, even while typing',
        always: true,
        inField: true,
      },
      dictate: {
        keys: 'Space',
        label: 'Start or stop a Dictation',
      },
      microphone: { keys: 'd', label: 'Choose the microphone' },
      theme: { keys: 't', label: 'Switch theme' },
      dictateAnywhere: {
        keys: 'ctrl+Space',
        label: 'Start or stop a Dictation, even while typing',
        always: true,
        inField: true,
      },
      settings: {
        keys: 'ctrl+,',
        label: 'Settings, or back from them',
        always: true,
        inField: true,
      },
    },
    surfaces: {
      sidebar: {
        actions: {
          next: { keys: 'j', label: 'Next row', repeat: true },
          previous: { keys: 'k', label: 'Previous row', repeat: true },
          first: { keys: 'g g', label: 'First row' },
          last: { keys: 'shift+g', label: 'Last row' },
          open: { keys: 'Enter', label: 'Open the row' },
          back: {
            keys: 'Escape',
            label: 'Back to the page',
            always: true,
            enters: 'content',
          },
        },
      },
      content: {
        label: 'page',
        initial: true,
        actions: {
          down: { keys: 'j', label: 'Scroll down', repeat: true },
          up: { keys: 'k', label: 'Scroll up', repeat: true },
          halfDown: { keys: 'ctrl+d', label: 'Half a page down', repeat: true },
          halfUp: { keys: 'ctrl+u', label: 'Half a page up', repeat: true },
          pageDown: {
            keys: 'PageDown',
            label: 'A page down',
            always: true,
            inField: true,
            repeat: true,
          },
          pageUp: {
            keys: 'PageUp',
            label: 'A page up',
            always: true,
            inField: true,
            repeat: true,
          },
          top: { keys: 'g g', label: 'To the top' },
          bottom: { keys: 'shift+g', label: 'To the bottom, following' },
          write: {
            keys: 'i',
            label: 'Edit the Draft, or open the question in its place',
          },
          send: { keys: 'Enter', label: 'Send the Draft' },
          undo: { keys: 'u', label: 'Undo the last thing put in the Draft' },
          skills: {
            keys: '/',
            label: 'Put a skill in the Draft',
          },
          model: { keys: 'm', label: 'Pick the model' },
          permissions: {
            keys: 'p',
            label: 'Pick the permissions',
          },
          effort: { keys: 'e', label: 'Pick the effort' },
          side: { keys: 'q', label: 'Ask on the side, or back' },
          sideAnywhere: {
            keys: 'ctrl+q',
            label: 'Ask on the side, or back, even while typing',
            always: true,
            inField: true,
          },
          previousSession: {
            keys: '[',
            label: 'Previous session in the sidebar',
            repeat: true,
          },
          nextSession: {
            keys: ']',
            label: 'Next session in the sidebar',
            repeat: true,
          },
          stop: {
            keys: 'mod+.',
            label: 'Stop the turn',
            always: true,
            inField: true,
          },
          close: {
            keys: 'Escape',
            label: 'Close the answer, or leave Settings',
            always: true,
          },
          question: { keys: 'y', label: 'Open or minimise the question' },
          questionAnywhere: {
            keys: 'ctrl+y',
            label: 'Open or minimise the question, even while typing',
            always: true,
            inField: true,
          },
        },
        surfaces: {
          record: { label: 'recording a key', isolated: true },
          confirm: { label: 'confirming', isolated: true },
          question: {
            label: 'question',
            actions: {
              next: {
                keys: 'ArrowDown',
                label: 'Next choice',
                always: true,
                repeat: true,
              },
              previous: {
                keys: 'ArrowUp',
                label: 'Previous choice',
                always: true,
                repeat: true,
              },
              down: { keys: 'j', label: 'Next choice', repeat: true },
              up: { keys: 'k', label: 'Previous choice', repeat: true },
              nextItem: {
                keys: 'ArrowRight',
                label: 'Next question',
                always: true,
              },
              previousItem: {
                keys: 'ArrowLeft',
                label: 'Previous question',
                always: true,
              },
              right: { keys: 'l', label: 'Next question' },
              left: { keys: 'h', label: 'Previous question' },
              toggle: {
                keys: 'Space',
                label: 'Choose, or let go',
                always: true,
              },
              pick: {
                keys: 'Enter',
                label: 'Choose, and on to the next question',
                always: true,
              },
              option1: { keys: '1', label: 'Choose option 1', always: true },
              option2: { keys: '2', label: 'Choose option 2', always: true },
              option3: { keys: '3', label: 'Choose option 3', always: true },
              option4: { keys: '4', label: 'Choose option 4', always: true },
              option5: { keys: '5', label: 'Choose option 5', always: true },
              option6: { keys: '6', label: 'Choose option 6', always: true },
              option7: { keys: '7', label: 'Choose option 7', always: true },
              option8: { keys: '8', label: 'Choose option 8', always: true },
              option9: { keys: '9', label: 'Choose option 9', always: true },
              write: { keys: 'i', label: 'Type your own answer' },
              send: {
                keys: 'mod+Enter',
                label: 'Send the answer',
                always: true,
                inField: true,
              },
              decline: { keys: 'd', label: 'Skip the question' },
              close: {
                keys: 'Escape',
                label: 'Leave your own answer, then minimise',
                always: true,
              },
            },
          },
        },
      },
      picker: {
        label: 'picker',
        always: true,
        isolated: true,
        actions: {
          clear: { keys: 'Escape', label: 'Clear the search', always: true },
          dictate: {
            keys: 'ctrl+Space',
            label: 'Start or stop a Dictation',
            always: true,
            inField: true,
          },
          back: {
            keys: ['ctrl+h', 'Backspace'],
            label: 'Back a step',
            always: true,
            inField: true,
          },
          pick: {
            keys: 'Enter',
            label: 'Pick the row',
            always: true,
            inField: true,
          },
          into: {
            keys: 'ctrl+l',
            label: 'Go into the row',
            always: true,
            inField: true,
          },
          finish: {
            keys: 'mod+Enter',
            label: 'Done, on the row highlighted',
            always: true,
            inField: true,
          },
          next: {
            keys: ['ctrl+n', 'ArrowDown'],
            label: 'Next row',
            always: true,
            inField: true,
            repeat: true,
          },
          previous: {
            keys: ['ctrl+p', 'ArrowUp'],
            label: 'Previous row',
            always: true,
            inField: true,
            repeat: true,
          },
        },
      },
    },
  },
});

type Id = ActionId<typeof keys.definition>;

/** One thing a person does, and the keys that do it, in either Mode. */
export interface KeyRow {
  readonly label: string;
  /** What works in either Mode, even while typing. */
  readonly always: ReadonlyArray<Id>;
  /** What works only in Vim Mode, by plain keys. */
  readonly vim: ReadonlyArray<Id>;
}

/**
 * Every Action as people look for it, by what it does rather than where
 * it works: one row per thing done, its keys in either Mode beside its
 * plain Vim Mode ones. Settings and the Actions list draw it; every Action
 * of the definition is in it once (`keys.test.ts`).
 */
export const keyTable: ReadonlyArray<{
  readonly title: string;
  readonly rows: ReadonlyArray<KeyRow>;
}> = [
  {
    title: 'Open',
    rows: [
      {
        label: 'Open a project',
        always: ['app.projectsAnywhere'],
        vim: ['app.projects'],
      },
      {
        label: 'Switch session',
        always: ['app.sessionsAnywhere'],
        vim: ['app.sessions'],
      },
      {
        label: 'Session actions',
        always: ['app.actionsAnywhere'],
        vim: ['app.actions'],
      },
      {
        label: 'New session in this project',
        always: ['app.newSessionAnywhere'],
        vim: ['app.newSession'],
      },
      {
        label: 'Settings, or back from them',
        always: ['app.settings'],
        vim: [],
      },
      {
        label: 'Show the keys',
        always: ['app.helpAnywhere'],
        vim: ['app.help'],
      },
    ],
  },
  {
    title: 'Move around',
    rows: [
      {
        label: 'The sidebar, the page',
        always: ['app.sideAnywhere', 'app.pageAnywhere'],
        vim: ['app.side', 'app.page'],
      },
      {
        label: 'Previous, next session',
        always: ['app.previousSession', 'app.nextSession'],
        vim: ['content.previousSession', 'content.nextSession'],
      },
      { label: 'Back, Forward', always: ['app.back', 'app.forward'], vim: [] },
      {
        label: 'Show or hide the sidebar',
        always: ['app.sidebarAnywhere'],
        vim: ['app.sidebar'],
      },
      {
        label: 'Scroll the page',
        always: ['content.pageUp', 'content.pageDown'],
        vim: [
          'content.down',
          'content.up',
          'content.halfDown',
          'content.halfUp',
        ],
      },
      {
        label: 'To the top, the bottom',
        always: [],
        vim: ['content.top', 'content.bottom'],
      },
      {
        label: 'Rows of the sidebar',
        always: [],
        vim: [
          'sidebar.next',
          'sidebar.previous',
          'sidebar.first',
          'sidebar.last',
        ],
      },
      { label: 'Open the sidebar’s row', always: [], vim: ['sidebar.open'] },
      {
        label: 'From the sidebar back to the page',
        always: ['sidebar.back'],
        vim: [],
      },
    ],
  },
  {
    title: 'The Draft',
    rows: [
      {
        label: 'Edit the Draft, or open the question in its place',
        always: [],
        vim: ['content.write'],
      },
      { label: 'Send the Draft', always: [], vim: ['content.send'] },
      {
        label: 'Undo the last thing put in',
        always: [],
        vim: ['content.undo'],
      },
      { label: 'Put a skill in', always: [], vim: ['content.skills'] },
      {
        label: 'Ask on the side, or back',
        always: ['content.sideAnywhere'],
        vim: ['content.side'],
      },
      {
        label: 'Pick the model, permissions, effort',
        always: [],
        vim: ['content.model', 'content.permissions', 'content.effort'],
      },
      {
        label: 'Start or stop a Dictation',
        always: ['app.dictateAnywhere'],
        vim: ['app.dictate'],
      },
      { label: 'Choose the microphone', always: [], vim: ['app.microphone'] },
    ],
  },
  {
    title: 'The session',
    rows: [
      { label: 'Stop the turn', always: ['content.stop'], vim: [] },
      {
        label: 'Close the answer, or leave Settings',
        always: ['content.close'],
        vim: [],
      },
      {
        label: 'Open or minimise the question',
        always: ['content.questionAnywhere'],
        vim: ['content.question'],
      },
    ],
  },
  {
    title: 'Answering a question',
    rows: [
      {
        label: 'Next, previous choice',
        always: ['question.next', 'question.previous'],
        vim: ['question.down', 'question.up'],
      },
      {
        label: 'Next, previous question',
        always: ['question.nextItem', 'question.previousItem'],
        vim: ['question.right', 'question.left'],
      },
      { label: 'Choose, or let go', always: ['question.toggle'], vim: [] },
      {
        label: 'Choose, and on to the next question',
        always: ['question.pick'],
        vim: [],
      },
      {
        label: 'Choose option 1 to 9',
        always: [
          'question.option1',
          'question.option2',
          'question.option3',
          'question.option4',
          'question.option5',
          'question.option6',
          'question.option7',
          'question.option8',
          'question.option9',
        ],
        vim: [],
      },
      { label: 'Type your own answer', always: [], vim: ['question.write'] },
      { label: 'Send the answer', always: ['question.send'], vim: [] },
      { label: 'Skip the question', always: [], vim: ['question.decline'] },
      {
        label: 'Leave your own answer, then minimise',
        always: ['question.close'],
        vim: [],
      },
    ],
  },
  {
    title: 'Inside a Picker',
    rows: [
      {
        label: 'Next, previous row',
        always: ['picker.next', 'picker.previous'],
        vim: [],
      },
      { label: 'Pick the row', always: ['picker.pick'], vim: [] },
      {
        label: 'Into the row, back a step',
        always: ['picker.into', 'picker.back'],
        vim: [],
      },
      {
        label: 'Done, on the row highlighted',
        always: ['picker.finish'],
        vim: [],
      },
      {
        label: 'Clear the search, then close',
        always: ['picker.clear'],
        vim: [],
      },
      {
        label: 'Start or stop a Dictation',
        always: ['picker.dictate'],
        vim: [],
      },
    ],
  },
  {
    title: 'The app',
    rows: [
      { label: 'Vim Mode on or off', always: ['app.vim'], vim: [] },
      { label: 'Switch theme', always: [], vim: ['app.theme'] },
    ],
  },
];

/**
 * An Action's first keys as bound now, the user's own over the defaults,
 * as people write them, for a button's title or a row's hint; null when
 * it has none.
 */
export const useBound = (id: ActionId<typeof keys.definition>) => {
  const [first] = keys.useKeysOf(id);
  return first === undefined ? null : describe(first);
};

// Every Action of the definition, by id.
const actionsOf = (
  surfaces: Definition,
): ReadonlyArray<
  readonly [
    string,
    {
      readonly keys: string | ReadonlyArray<string>;
      readonly label: string;
      readonly inField?: boolean;
    },
  ]
> =>
  Object.entries(surfaces).flatMap(
    ([surface, { actions, surfaces: inner }]) => [
      ...Object.entries(actions ?? {}).map(
        ([name, action]) => [`${surface}.${name}`, action] as const,
      ),
      ...actionsOf(inner ?? {}),
    ],
  );

const actions = new Map(actionsOf(keys.definition));

/** Whether an Action works while typing, so a plain key cannot be its own. */
export const worksWhileTyping = (id: string) =>
  actions.get(id)?.inField === true;

/** What an Action does, as its definition says it. */
export const labelOf = (id: string) => actions.get(id)?.label ?? id;

/**
 * An Action's keys under the user's Bindings, else its defaults, as people
 * write them, for an actor that names them.
 */
export const keysIn = (
  bindings: Readonly<Record<string, ReadonlyArray<string>>>,
  id: ActionId<typeof keys.definition>,
): ReadonlyArray<string> => {
  const written = bindings[id] ?? actions.get(id)?.keys ?? [];
  return typeof written === 'string' ? [written] : written;
};

/** An Action's first keys, as `keysIn` gives them; null with none. */
export const boundIn = (
  bindings: Readonly<Record<string, ReadonlyArray<string>>>,
  id: ActionId<typeof keys.definition>,
) => keysIn(bindings, id)[0] ?? null;

/**
 * For a text editor with keys of its own, such as the Composer's: runs the
 * Action that works now while typing whose keys, as bound now, are the
 * keys pressed, as people write them, and says whether there was one. The
 * editor takes the key before the page could, so it hands it on.
 */
export const useTypingKeys = () => {
  const available = keys.useAvailableActions();
  const latest = useRef(available);
  latest.current = available;
  return useCallback((pressed: string) => {
    const action = latest.current.find(
      ({ id, shadowed, keys: bound }) =>
        !shadowed &&
        worksWhileTyping(id) &&
        bound.some((each) => describe(each) === pressed),
    );
    action?.run();
    return action !== undefined;
  }, []);
};

/*
 * Bindings as kept may no longer fit the keys definition: an Action gone,
 * keys that are no Shortcut, or a default added since that now Conflicts.
 * The Keys Provider throws on the first and, in development, on the last,
 * so what is read keeps only the Bindings that still fit.
 */

type Bindings = Readonly<Record<string, ReadonlyArray<string>>>;

/**
 * The Bindings that fit the definition: invalid ones, and each in a
 * Conflict, dropped, again until none is, since a dropped one's defaults
 * can Conflict with another's. Defaults never Conflict, so it ends.
 */
export const fitted = (bindings: Bindings): Bindings => {
  const check = keys.checkBindings(bindings);
  const dropped = new Set([
    ...check.invalid.map(({ id }) => id),
    ...check.conflicts.flatMap((conflict) =>
      [conflict.id, conflict.with].filter((id) => id in bindings),
    ),
  ]);
  const kept = Object.entries(bindings).filter(([id]) => !dropped.has(id));
  return kept.length === Object.keys(bindings).length
    ? bindings
    : fitted(Object.fromEntries(kept));
};
