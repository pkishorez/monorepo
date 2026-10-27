import { Effect, SubscriptionRef } from 'effect';
import type { AgentQuestion, SessionQuestions } from '@kestack/connect/code';

/*
 * Development's Agent Questions, so the Question Panel can be tried with
 * no agent asking: a session's address with `?question=` and one of
 * `single`, `mixed`, `secret` or `long`, loaded, adds one of that shape to
 * that session's. Outside development there are none.
 */

const PREFIX = 'sample-';

/** Whether a question is one of these. */
export const isSample = (questionId: string) => questionId.startsWith(PREFIX);

type Sample = SessionQuestions & { readonly machineId: string };

const SHAPES: Record<string, AgentQuestion['items']> = {
  single: [
    {
      id: '0',
      header: 'Auth method',
      question: 'Which way should users sign in?',
      options: [
        { label: 'Magic link', description: 'A one-time link by email.' },
        { label: 'Passkey', description: 'Face ID, Touch ID or a key.' },
        { label: 'Password', description: 'The usual email and password.' },
      ],
      multiSelect: false,
      other: true,
      secret: false,
    },
  ],
  mixed: [
    {
      id: '0',
      header: 'Database',
      question: 'Which database should the service use?',
      options: [
        { label: 'Postgres', description: 'What the other services run on.' },
        { label: 'SQLite', description: 'One file, next to the service.' },
      ],
      multiSelect: false,
      other: true,
      secret: false,
    },
    {
      id: '1',
      header: 'Checks',
      question: 'Which checks should run before each commit?',
      options: [
        { label: 'Types', description: 'tsc --noEmit' },
        { label: 'Lint', description: '' },
        { label: 'Tests', description: 'The unit tests only.' },
      ],
      multiSelect: true,
      other: true,
      secret: false,
    },
    {
      id: '2',
      header: 'Name',
      question: 'What should the new package be called?',
      options: [],
      multiSelect: false,
      other: true,
      secret: false,
    },
  ],
  secret: [
    {
      id: 'token',
      header: 'API token',
      question: 'Paste the API token for the staging account.',
      options: [],
      multiSelect: false,
      other: true,
      secret: true,
    },
  ],
  long: [
    {
      id: '0',
      header: 'Region',
      question: 'Which region should the bucket live in?',
      options: [
        'us-east-1',
        'us-east-2',
        'us-west-1',
        'us-west-2',
        'ca-central-1',
        'eu-west-1',
        'eu-west-2',
        'eu-west-3',
        'eu-central-1',
        'eu-north-1',
        'eu-south-1',
        'ap-south-1',
        'ap-southeast-1',
        'ap-southeast-2',
        'ap-northeast-1',
        'ap-northeast-2',
        'sa-east-1',
        'me-south-1',
      ].map((label, at) => ({
        label,
        description: at % 3 === 0 ? 'Closest to most of your users.' : '',
      })),
      multiSelect: false,
      other: false,
      secret: false,
    },
  ],
};

/** The sample the address asks for, on its session. */
const asked = (): ReadonlyArray<Sample> => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return [];
  const shape = new URLSearchParams(location.search).get('question');
  const place = /^\/m\/([^/]+)\/p\/([^/]+)\/s\/([^/]+)/.exec(location.pathname);
  const items = shape === null ? undefined : SHAPES[shape];
  if (items === undefined || place === null) return [];
  const [, machineId = '', projectId = '', sessionId = ''] = place;
  return [
    {
      machineId: decodeURIComponent(machineId),
      projectId: decodeURIComponent(projectId),
      sessionId: decodeURIComponent(sessionId),
      questions: [{ id: `${PREFIX}${shape}`, items, askedAt: Date.now() }],
    },
  ];
};

/** The samples asked, until each is answered. */
export const samples = Effect.runSync(SubscriptionRef.make(asked()));
