/*
 * The story the home page tells, one chapter per stop: building an app
 * with the stack, from the framework out to the small parts. Each chapter
 * names the shape the particle field takes while it is read, and which
 * half of a wide screen that shape takes, so the words go in the other.
 * Package names are lowercase, always.
 */

export type Chapter = {
  readonly shape: string;
  /** Where the shape sits on a wide screen; the words take the other half. */
  readonly side: 'left' | 'right';
  readonly act: string;
  readonly name: string;
  readonly pitch: string;
  readonly specifics: ReadonlyArray<string>;
  /** `alpha` has docs to read; `soon` does not, yet. */
  readonly status: 'alpha' | 'soon';
  /** The small packages, listed instead of specifics. */
  readonly parts?: ReadonlyArray<{
    readonly name: string;
    readonly line: string;
  }>;
};

export const CHAPTERS: ReadonlyArray<Chapter> = [
  {
    shape: 'kabuki',
    side: 'right',
    act: 'the app',
    name: 'kabuki',
    pitch: 'An app is one tree of Actors, and it lives outside React.',
    specifics: [
      'Each Actor is a small state machine, moved by Messages',
      'One Snapshot holds the whole app',
      'Effect runs the work. React only draws it.',
    ],
    status: 'alpha',
  },
  {
    shape: 'web',
    side: 'left',
    act: 'the app',
    name: 'web-platform',
    pitch: 'How I start every app: one config, and the rest is wired up.',
    specifics: [
      'A PWA on TanStack Start',
      'Theme, APIs, accounts and sessions',
      'Components and forms',
    ],
    status: 'soon',
  },
  {
    shape: 'rpc',
    side: 'right',
    act: 'the wire & the data',
    name: 'rpc-toolkit',
    pitch: 'Effect RPC and HttpApi, with middleware both ends agree on.',
    specifics: [
      'Three transports',
      'The same middleware on client and server',
      'Cloudflare deploys declared next to the API',
    ],
    status: 'soon',
  },
  {
    shape: 'std',
    side: 'left',
    act: 'the wire & the data',
    name: 'std-toolkit',
    pitch: 'Single-table design, synced to the client, whatever the database.',
    specifics: [
      'Sync over item collections',
      'Schema evolution and portable adapters',
      'TanStack DB on the client',
    ],
    status: 'soon',
  },
  {
    shape: 'auth',
    side: 'right',
    act: 'the wire & the data',
    name: 'auth-toolkit',
    pitch:
      'One sign-in service on Cloudflare, and one guard both sides import.',
    specifics: [
      'Sign in from the web or from a device',
      'The same guard on client and server',
    ],
    status: 'soon',
  },
  {
    shape: 'ai',
    side: 'left',
    act: 'the wire & the data',
    name: 'ai-toolkit',
    pitch: 'An Effect-native runtime for coding agents that keep their state.',
    specifics: [
      'Stateful agent harnesses',
      'Every message stored in a StdTable',
    ],
    status: 'soon',
  },
  {
    shape: 'lotel',
    side: 'right',
    act: 'the tools',
    name: 'lotel',
    pitch: 'Every trace, on your own machine. No cloud account.',
    specifics: ['Local OpenTelemetry', 'Nothing leaves your laptop'],
    status: 'soon',
  },
  {
    shape: 'laymos',
    side: 'left',
    act: 'the tools',
    name: 'laymos',
    pitch: 'The architecture, written as rules a linter checks.',
    specifics: [
      'One tree of modules',
      'Which module may import which',
      'A way to explore the dependencies',
    ],
    status: 'soon',
  },
  {
    shape: 'monoverse',
    side: 'right',
    act: 'the tools',
    name: 'monoverse',
    pitch: 'A map of the monorepo, inside DevTools.',
    specifics: ['Every package and what it depends on', 'Laymos rules, drawn'],
    status: 'soon',
  },
  {
    shape: 'parts',
    side: 'left',
    act: 'the small parts',
    name: 'Five small packages',
    pitch: 'Things I kept rewriting, so now they are packages.',
    specifics: [],
    status: 'soon',
    parts: [
      {
        name: 'use-keys',
        line: 'Keyboard shortcuts for React. Every key, shortcuts and sequences.',
      },
      { name: 'use-gesture', line: 'Touch gestures that read every finger.' },
      {
        name: 'use-effect-ts',
        line: 'Hooks that run Effect programs, cached with TanStack Query.',
      },
      {
        name: 'effect-webrtc',
        line: 'Peer sessions and RPC over WebRTC data channels.',
      },
      {
        name: 'effect-tracer',
        line: 'Record traces in process, export them as OTLP.',
      },
    ],
  },
];
