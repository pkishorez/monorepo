/*
 * The Actor tree of apps/code, written out by hand for this prototype from
 * each `actor.ts` and docs/kabuki-tree.md. The facts (States, Children,
 * Requires, Provides, conditions) are read from the code. The sentences and
 * the questions are a person's: the part code cannot say.
 */

export type Kind = 'actor' | 'library' | 'folder';

export type Exists =
  | { readonly how: 'root' }
  | { readonly how: 'always' }
  | { readonly how: 'while'; readonly text: string }
  | { readonly how: 'each'; readonly text: string }
  | { readonly how: 'page'; readonly text: string };

export interface StateOf {
  readonly name: string;
  readonly says: string;
}

export interface Named {
  readonly name: string;
  readonly says: string;
}

interface Written {
  readonly name: string;
  readonly kind?: Kind;
  readonly question: string;
  readonly says: string;
  readonly story?: string;
  readonly exists?: Exists;
  /** The States this one exists in, when its parent's State decides. */
  readonly onlyIn?: ReadonlyArray<string>;
  readonly states?: ReadonlyArray<StateOf>;
  readonly gives?: ReadonlyArray<Named>;
  readonly needs?: ReadonlyArray<string>;
  /** Where it lives, under src/app. No folder: a library or a factory. */
  readonly folder?: string;
  /** What else its folder holds that is not an Actor. */
  readonly parts?: ReadonlyArray<Named>;
  readonly children?: ReadonlyArray<Written>;
}

export interface Node extends Omit<Written, 'children'> {
  readonly id: string;
  readonly kind: Kind;
  readonly exists: Exists;
  readonly states: ReadonlyArray<StateOf>;
  readonly gives: ReadonlyArray<Named>;
  readonly needs: ReadonlyArray<string>;
  readonly parts: ReadonlyArray<Named>;
  readonly parent: Node | null;
  readonly children: ReadonlyArray<Node>;
  /** Every Actor below this one, however deep. */
  readonly size: number;
}

const pickerOwner = {
  name: 'its Picker’s owner',
  says: 'Where what is picked goes.',
};

const row = (name: string, question: string, says: string, exists?: Exists) =>
  ({
    name,
    kind: 'library',
    question,
    says,
    ...(exists ? { exists } : {}),
  }) satisfies Written;

const draftOf = (exists: Exists, question: string): Written => ({
  name: 'draft',
  question,
  says: 'The next message of this page, and what goes with it.',
  story:
    'The same Actor serves a new session and an open one. It is its own Actor so that typing, picking or dictating into it draws only it.',
  exists,
  needs: [
    'CodeClient',
    'SharedCatalog',
    'SessionArrival',
    'Handover',
    'Navigation',
    'Storage',
    'Accounts',
    'RpcConnection',
  ],
  gives: [
    { name: 'Owner', says: 'What each Draft Mode hands to the Draft.' },
    pickerOwner,
  ],
  folder: 'account/pages/project/draft',
  parts: [{ name: 'send/', says: 'How a written message goes out.' }],
  children: [
    {
      name: 'modes',
      question: 'Who holds the text being typed?',
      says: 'One Actor per Draft Mode, each the one owner of its text and cursor.',
      story:
        'A Message, or in a Session a Btw. Switching away and back finds each as it was left.',
      exists: { how: 'each', text: 'each Draft Mode' },
      needs: ['Owner'],
      gives: [{ name: 'Owner', says: 'How the Touch Draft sends and opens.' }],
      folder: 'account/pages/project/draft/write',
      children: [
        {
          name: 'touch',
          question: 'What about a phone?',
          says: 'The Draft on a device with no keyboard: one line until it is opened.',
          story:
            'It says only which State it is in. Its View starts and takes the Dictation through the Draft’s mic.',
          states: [
            { name: 'Collapsed', says: 'One line at the page’s foot.' },
            { name: 'Expanded', says: 'Opened, ready to be used.' },
            { name: 'Editing', says: 'The keyboard is up.' },
            { name: 'Recording', says: 'A Dictation is going.' },
            { name: 'Transcribing', says: 'A Dictation is being written out.' },
            { name: 'Sending', says: 'On its way to the Session.' },
          ],
          needs: ['Preferences', 'Owner'],
          folder: 'account/pages/project/draft/write/touch',
        },
      ],
    },
    {
      name: 'choose',
      question: 'How do I pick a skill or model?',
      says: 'The Draft’s Pickers, one open at a time.',
      story:
        'It only sits between the Draft and its Pickers, so the Draft has two kinds of Children and not four. The Draft keeps which one is open.',
      folder: 'account/pages/project/draft/choose',
      children: [
        row(
          'skills',
          'Which Skill goes in?',
          'A Skill to put in at the cursor.',
          {
            how: 'while',
            text: 'while Skills is picked',
          },
        ),
        row(
          'models',
          'Which agent and model?',
          'The agent, its model and settings.',
          {
            how: 'while',
            text: 'while Model is picked',
          },
        ),
        row('branches', 'Which Branch?', 'A Branch for a new session.', {
          how: 'while',
          text: 'while Branch is picked',
        }),
      ],
    },
  ],
});

const written: Written = {
  name: 'App',
  question: 'What is this app?',
  says: 'The root page: it asks who is signed in, and holds the rest of the app under that Account.',
  story:
    'Code runs Claude Code and Codex Sessions in Projects, on every Connection of an Account at once. This Actor only settles who is here and puts the address under that Account. What this device keeps, and what is drawn while no Account is, sit beside it as folders.',
  exists: { how: 'root' },
  states: [
    { name: 'Reading', says: 'auth-toolkit has not said anything yet.' },
    {
      name: 'Checking',
      says: 'Shows what this device kept while the Auth Worker is asked.',
    },
    { name: 'SignedOut', says: 'Nobody is signed in: the sign-in screen.' },
    { name: 'SignedIn', says: 'An Account is active: the app.' },
  ],
  needs: ['Navigation', 'Accounts', 'Storage'],
  gives: [{ name: 'CurrentAccount', says: 'Who is signed in, for all below.' }],
  folder: '.',
  parts: [
    { name: 'storage/', says: 'What this device keeps.' },
    { name: 'sign-in/', says: 'What is drawn in place of the app.' },
  ],
  children: [
    row(
      'account',
      'How do I switch Accounts?',
      'The Account Switcher, from auth-toolkit.',
    ),
    {
      name: 'Account',
      question: 'What do I get once signed in?',
      says: 'One Account’s page, and all of the app under it.',
      story:
        'A tab acts only as the Account active, browser-wide. So the app is drawn only while this is that Account; otherwise the page says why, and how to get there. It never switches by itself.',
      exists: { how: 'page', text: 'at /a/:accountId' },
      states: [
        { name: 'Away', says: 'Not the active Account. One screen says why.' },
        { name: 'Active', says: 'The active Account. The app is drawn.' },
      ],
      needs: [
        'Accounts',
        'CloudClient',
        'Storage',
        'Preferences',
        'OnOutdated',
      ],
      gives: [
        { name: 'Connections', says: 'The list, and how each one stands.' },
        { name: 'CodeClients', says: 'Each Connection’s client, borrowed.' },
        { name: 'Replicas', says: 'Each Connection’s records.' },
        { name: 'Sockets', says: 'What opens each socket.' },
        { name: 'Moves', says: 'Each Move on its way.' },
        { name: 'Voice', says: 'Asks for a Dictation, from any field.' },
      ],
      folder: 'account',
      children: [
        {
          name: 'connection',
          question: 'How does it reach a machine?',
          says: 'One per listed Connection. It owns the one socket to it.',
          story:
            'It keeps its setup, reads its Unseen marks and opens its own sync Store and socket. No socket of an Account is open outside Active: everything else borrows this one while it runs.',
          exists: { how: 'each', text: 'each listed Connection' },
          onlyIn: ['Active'],
          states: [
            { name: 'Reading', says: 'Reads the setup this device kept.' },
            { name: 'Shown', says: 'Shows it, and keeps it up to date.' },
          ],
          needs: ['CodeClients', 'Sockets', 'Storage', 'Connections'],
          gives: [
            { name: 'its own Replicas', says: 'Over its own Store.' },
            { name: 'its socket', says: 'For its Instance only.' },
          ],
          folder: 'account/connection',
          parts: [
            {
              name: 'link/',
              says: 'How it is reached: socket, health, refusals.',
            },
            {
              name: 'records/',
              says: 'What it holds: questions, jobs, Moves.',
            },
          ],
          children: [
            row(
              'replicas',
              'Where do its records live?',
              'Its Replica Instances, over its own Store.',
            ),
          ],
        },
        {
          name: 'frame',
          question: 'What surrounds every page?',
          says: 'The sidebar, the header and the Pickers, and the keys over them.',
          story:
            'It holds the keys, Vim Mode, the Window and the Text Size. It waits for its keys to be read, so it draws at once.',
          exists: { how: 'while', text: 'while its keys are read' },
          onlyIn: ['Active'],
          needs: ['Navigation', 'Preferences'],
          gives: [
            { name: 'ConnectionFilter', says: 'Which Connections are shown.' },
          ],
          folder: 'account/frame',
          parts: [
            { name: 'commands.ts', says: 'Every key and Action of the app.' },
          ],
          children: [
            {
              name: 'sidebar',
              question: 'Where do I find my work?',
              says: 'The Projects and Sessions of the Connections shown.',
              story:
                'It reads the Connection list for its filter, and what this device marks. It draws its width and rows from this device first.',
              needs: [
                'Connections',
                'ConnectionFilter',
                'Preferences',
                'Moves',
                'Navigation',
              ],
              folder: 'account/frame/sidebar',
              parts: [
                { name: 'list/', says: 'Its rows, Settled List and swipe.' },
                {
                  name: 'bars/',
                  says: 'Its header and, on a phone, its foot.',
                },
              ],
              children: [
                row(
                  'projects',
                  'Which Projects are listed?',
                  'One Query per Connection shown.',
                  {
                    how: 'each',
                    text: 'each Connection shown',
                  },
                ),
                row(
                  'sessions',
                  'Which Sessions are listed?',
                  'One Query per Connection shown.',
                  {
                    how: 'each',
                    text: 'each Connection shown',
                  },
                ),
                {
                  name: 'prefetch',
                  question: 'Why does a Session open at once?',
                  says: 'It syncs the messages of every Session shown before it is opened.',
                  story:
                    'The Query selects only ids, so its Model and the History stay small. Opening the Session then draws from this device.',
                  needs: ['Replicas'],
                  folder: 'account/frame/sidebar/prefetch',
                  children: [
                    row(
                      'messages',
                      'What opens the sync?',
                      'One MessageIds Query per Session.',
                      {
                        how: 'each',
                        text: 'each Session shown',
                      },
                    ),
                  ],
                },
              ],
            },
            {
              name: 'header',
              question: 'Where am I?',
              says: 'Where you are, from the rows the URL names, and Voice.',
              story:
                'It reads only those two rows, so a change to any other row draws nothing here.',
              folder: 'account/frame/header',
              children: [
                row('project', 'Which Project?', 'A ProjectRow Query.', {
                  how: 'while',
                  text: 'while the URL names one',
                }),
                row('session', 'Which Session?', 'A SessionRow Query.', {
                  how: 'while',
                  text: 'while the URL names one',
                }),
                {
                  name: 'voice',
                  question: 'Why does recording survive a move?',
                  says: 'Recording from anywhere: it lives in the header, around every page.',
                  story:
                    'Each recording has an Owner, the field that started it. You can stop it from anywhere, and its text still goes to that field.',
                  needs: ['Voice'],
                  gives: [
                    { name: 'Recorder', says: 'The browser’s microphone.' },
                  ],
                  folder: 'account/frame/header/voice',
                  parts: [
                    { name: 'recorder/', says: 'The browser’s microphone.' },
                  ],
                  children: [
                    {
                      name: 'dictation',
                      question: 'What happens when I record?',
                      says: 'The one Dictation: it records, has it written out, and keeps the text for its field.',
                      states: [
                        { name: 'Idle', says: 'Nothing is going.' },
                        { name: 'Waiting', says: 'The microphone is opening.' },
                        { name: 'Recording', says: 'Audio is coming in.' },
                        {
                          name: 'Transcribing',
                          says: 'It stopped, and the text is being finished.',
                        },
                        { name: 'Failed', says: 'It says why, and can retry.' },
                      ],
                      needs: ['Preferences', 'Recorder', 'Voice'],
                      folder: 'account/frame/header/voice/dictation',
                      children: [
                        {
                          name: 'take',
                          question: 'Who turns audio into words?',
                          says: 'One Take: audio sent to its Connection, text heard coming back.',
                          exists: { how: 'each', text: 'each Take' },
                          onlyIn: ['Recording', 'Transcribing'],
                          needs: ['CodeClients', 'Connections', 'Recorder'],
                          folder: 'account/frame/header/voice/dictation/take',
                        },
                      ],
                    },
                    {
                      name: 'microphone',
                      question: 'Which microphone does it use?',
                      says: 'The Microphone Picker: which of this browser’s microphones.',
                      needs: ['Recorder', 'Preferences'],
                      gives: [pickerOwner],
                      folder: 'account/frame/header/voice/microphone',
                      children: [
                        row(
                          'picker',
                          'How is it shown?',
                          'One of Picker.make.',
                          {
                            how: 'while',
                            text: 'while picking',
                          },
                        ),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'pickers',
              question: 'What do the keys open?',
              says: 'The Pickers over every page, each told only what it needs of the frame.',
              story:
                'It only sits between the frame and the Pickers that crowded it, and hands on its Props.',
              folder: 'account/frame/pickers',
              children: [
                {
                  name: 'projects',
                  question: 'Where do I work next?',
                  says: 'The Project Picker, with its folder Steps.',
                  needs: [
                    'CodeClients',
                    'Navigation',
                    'Replicas',
                    'Connections',
                    'ConnectionFilter',
                  ],
                  gives: [pickerOwner],
                  folder: 'account/frame/pickers/projects',
                  children: [
                    row('picker', 'How is it shown?', 'One of Picker.make.', {
                      how: 'while',
                      text: 'while picking',
                    }),
                  ],
                },
                {
                  name: 'sessions',
                  question: 'How do I get back to a Session?',
                  says: 'The Session Switcher: every Session, across Projects and Connections.',
                  needs: ['Navigation', 'Replicas', 'Connections'],
                  gives: [pickerOwner],
                  folder: 'account/frame/pickers/sessions',
                  children: [
                    row('picker', 'How is it shown?', 'One of Picker.make.', {
                      how: 'while',
                      text: 'while picking',
                    }),
                  ],
                },
                {
                  name: 'actions',
                  question: 'What can I do right here?',
                  says: 'What can be done where you are, each with its keys.',
                  needs: ['CodeClients', 'Moves', 'Navigation', 'Replicas'],
                  gives: [pickerOwner],
                  folder: 'account/frame/pickers/actions',
                  children: [
                    row('picker', 'How is it shown?', 'One of Picker.make.', {
                      how: 'while',
                      text: 'while picking',
                    }),
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'pages',
          kind: 'folder',
          question: 'Which page is showing?',
          says: 'One page at a time, from the address.',
          story:
            'This is a folder, not an Actor: the Account holds its pages directly. A page is kept whatever the Account’s State, so it asks its Connection anything only while that Connection runs.',
          folder: 'account/pages',
          children: [
            {
              name: 'Home',
              question: 'What do I see first?',
              says: 'Every Connection’s Projects to pick from.',
              exists: { how: 'page', text: 'at /a/:accountId' },
              needs: ['Connections'],
              folder: 'account/pages/home',
              children: [
                row(
                  'projects',
                  'Which Projects?',
                  'One Query per Connection shown.',
                  {
                    how: 'each',
                    text: 'each Connection shown',
                  },
                ),
              ],
            },
            {
              name: 'Project',
              question: 'Where does the work happen?',
              says: 'One Project: a new Session in it, and the Session open under it.',
              story:
                'It holds no socket. Each call it makes borrows its Connection’s, waiting while that Connection does not run.',
              exists: {
                how: 'page',
                text: 'at …/m/:connectionId/p/:projectId',
              },
              needs: [
                'CodeClients',
                'Connections',
                'Navigation',
                'Storage',
                'Preferences',
                'Replicas',
              ],
              gives: [
                { name: 'CodeClient', says: 'Its Connection’s, borrowed.' },
                { name: 'SharedCatalog', says: 'Agents, models and Skills.' },
                {
                  name: 'SessionArrival',
                  says: 'A new session whose answer was lost.',
                },
                {
                  name: 'Handover',
                  says: 'A new session, kept drawn until ready.',
                },
              ],
              folder: 'account/pages/project',
              children: [
                row(
                  'project',
                  'Which Project is this?',
                  'Its row, a ProjectRow Query.',
                ),
                draftOf(
                  { how: 'while', text: 'while no Session is open' },
                  'How do I start a Session?',
                ),
                {
                  name: 'Session',
                  question: 'What does an open Session hold?',
                  says: 'Its transcript, its Draft, and the Question Panel.',
                  story:
                    'These are its three kinds of Children. The Question Panel stands in for the Draft while the agent asks.',
                  exists: { how: 'page', text: 'at …/s/:sessionId' },
                  needs: [
                    'CodeClient',
                    'Replicas',
                    'Storage',
                    'Connections',
                    'Preferences',
                  ],
                  gives: [pickerOwner],
                  folder: 'account/pages/project/session',
                  parts: [
                    { name: 'scroller/', says: 'The column it scrolls in.' },
                    { name: 'panels/details', says: 'The Session details.' },
                  ],
                  children: [
                    {
                      name: 'transcript',
                      question: 'What has been said?',
                      says: 'What the Session says, as this device holds it.',
                      story:
                        'It only reads. The Session acts on what is read, and keeps how the transcript is open.',
                      folder: 'account/pages/project/session/transcript',
                      children: [
                        row(
                          'session',
                          'Does it run?',
                          'Its row: whether it runs, its agent and model.',
                        ),
                        row(
                          'messages',
                          'Where do the messages come from?',
                          'One Query for it, and for each Session up its fork chain.',
                          {
                            how: 'each',
                            text: 'each Session in its fork chain',
                          },
                        ),
                        row(
                          'running',
                          'What is running now?',
                          'The Running Picker.',
                          {
                            how: 'while',
                            text: 'while open',
                          },
                        ),
                      ],
                    },
                    draftOf({ how: 'always' }, 'How do I reply?'),
                    {
                      name: 'question',
                      question: 'What if the agent asks me?',
                      says: 'The Agent Questions its agent waits on, answered in the Draft’s place.',
                      story:
                        'Answers so far are kept on the Connection, in memory and never on storage, as an answer may be a secret.',
                      needs: ['Connections', 'CodeClient'],
                      folder: 'account/pages/project/session/panels/question',
                    },
                  ],
                },
              ],
            },
            {
              name: 'Settings',
              question: 'Where do I change things?',
              says: 'Four tabs: General, Shortcuts, About and Connections.',
              exists: { how: 'page', text: 'at /a/:accountId/settings' },
              folder: 'account/pages/settings',
              parts: [
                {
                  name: 'browser/about',
                  says: 'This version, and a fresh start.',
                },
              ],
              children: [
                {
                  name: 'general',
                  question: 'What does this browser remember?',
                  says: 'What the user sets here, from Preferences.',
                  needs: ['Preferences'],
                  folder: 'account/pages/settings/browser/general',
                },
                {
                  name: 'shortcuts',
                  question: 'Can I change the keys?',
                  says: 'Every Action and its keys, and changing them.',
                  needs: ['Preferences'],
                  folder: 'account/pages/settings/browser/shortcuts',
                },
                {
                  name: 'cards',
                  question: 'How do I manage Connections?',
                  says: 'The Account’s Connections, so the list never waits for one.',
                  needs: ['Connections'],
                  gives: [
                    {
                      name: 'ConnectionCards',
                      says: 'What each card asks of the list.',
                    },
                  ],
                  folder: 'account/pages/settings/cards',
                  children: [
                    {
                      name: 'card',
                      question: 'What can I set on one?',
                      says: 'One Connection’s card, and its own settings.',
                      exists: { how: 'each', text: 'each listed Connection' },
                      needs: ['ConnectionCards', 'CloudClient', 'Connections'],
                      folder: 'account/pages/settings/cards/card',
                      children: [
                        {
                          name: 'agents',
                          question: 'Which logins does it run as?',
                          says: 'Its Harness Accounts, by agent.',
                          needs: ['Connections'],
                          gives: [
                            {
                              name: 'AccountList',
                              says: 'Opens and closes each card.',
                            },
                          ],
                          folder: 'account/pages/settings/cards/card/agents',
                          children: [
                            {
                              name: 'card',
                              question: 'What is one login?',
                              says: 'One Harness Account: its name, binary and config folder.',
                              exists: {
                                how: 'each',
                                text: 'each Harness Account open',
                              },
                              needs: [
                                'CodeClients',
                                'Connections',
                                'AccountList',
                              ],
                              folder:
                                'account/pages/settings/cards/card/agents/card',
                            },
                          ],
                        },
                        {
                          name: 'speech',
                          question: 'Can it hear me?',
                          says: 'Its Speech to Text switch, over its own socket.',
                          needs: ['CodeClients'],
                          folder: 'account/pages/settings/cards/card/speech',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const build = (w: Written, parent: Node | null): Node => {
  const id = parent ? `${parent.id}/${w.name}` : 'app';
  const node = {
    ...w,
    id,
    kind: w.kind ?? 'actor',
    exists: w.exists ?? { how: 'always' },
    states: w.states ?? [],
    gives: w.gives ?? [],
    needs: w.needs ?? [],
    parts: w.parts ?? [],
    parent,
    children: [] as ReadonlyArray<Node>,
    size: 0,
  } as Node & { children: ReadonlyArray<Node>; size: number };
  node.children = (w.children ?? []).map((child) => build(child, node));
  node.size = node.children.reduce((sum, child) => sum + child.size + 1, 0);
  return node;
};

export const root = build(written, null);

const walk = (node: Node): ReadonlyArray<Node> => [
  node,
  ...node.children.flatMap(walk),
];

/** Every node, in the order a reader goes depth first. */
export const all = walk(root);

const byId = new Map(all.map((node) => [node.id, node]));

export const find = (id: string | null): Node =>
  (id !== null && byId.get(id)) || root;

/** From the root down to this node, itself last. */
export const pathOf = (node: Node): ReadonlyArray<Node> =>
  node.parent ? [...pathOf(node.parent), node] : [node];

const fromAbove: Record<string, string> = {
  Accounts: 'start.tsx',
  CloudClient: 'start.tsx',
  Preferences: 'start.tsx',
  Storage: 'start.tsx',
  OnOutdated: 'start.tsx',
  Navigation: 'the router',
};

/** Who gives what this node needs: the nearest above it, or what starts the app. */
export const sourceOf = (
  node: Node,
  need: string,
): { readonly node: Node } | { readonly text: string } => {
  for (let at = node.parent; at; at = at.parent) {
    if (at.gives.some((given) => given.name === need)) return { node: at };
  }
  return { text: fromAbove[need] ?? 'further up' };
};

/** Whether this child exists while its parent is in that State. */
export const existsIn = (node: Node, state: string | null) =>
  state === null || !node.onlyIn || node.onlyIn.includes(state);

export const whereOf = (exists: Exists): string | null =>
  exists.how === 'while' || exists.how === 'each' || exists.how === 'page'
    ? exists.text
    : null;

export const kindOf = (node: Node): string | null =>
  node.kind === 'folder'
    ? 'folder, not an Actor'
    : node.kind === 'library'
      ? 'library'
      : null;

/** The prototype's limit: above it, a part needs a written reason. */
export const LIMIT = 3;

/** One card as plain text: the same story, for an agent or a pull request. */
export const asText = (node: Node): string =>
  [
    `## ${pathOf(node)
      .map((at) => at.name)
      .join(' › ')}`,
    '',
    node.says,
    ...(node.story ? ['', node.story] : []),
    ...(node.states.length
      ? ['', `States: ${node.states.map((state) => state.name).join(', ')}`]
      : []),
    ...(node.gives.length
      ? ['', `Gives: ${node.gives.map((given) => given.name).join(', ')}`]
      : []),
    ...(node.needs.length ? ['', `Needs: ${node.needs.join(', ')}`] : []),
    ...(node.folder ? ['', `Folder: src/app/${node.folder}`] : []),
    ...(node.children.length
      ? [
          '',
          'Children:',
          ...node.children.map(
            (child) => `- ${child.name}: ${child.question} ${child.says}`,
          ),
        ]
      : []),
  ].join('\n');
