/*
 * The story the home page tells, one chapter per stop: an app, its data,
 * and who may use it, each a package of the stack. The rest of the stack
 * joins the story when it has docs. Each chapter
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
};

export const CHAPTERS: ReadonlyArray<Chapter> = [
  {
    shape: 'kabuki',
    side: 'right',
    act: 'the app',
    name: 'kabuki',
    pitch: 'An app is one tree of Actors, outside React.',
    specifics: [
      'Each Actor is a small state machine, moved by Messages',
      'One Snapshot holds the whole app',
      'Effect runs the work. React only draws it.',
    ],
    status: 'alpha',
  },
  {
    shape: 'std',
    side: 'left',
    act: 'its data',
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
    act: 'who gets in',
    name: 'auth-toolkit',
    pitch:
      'One sign-in service on Cloudflare, and one guard both sides import.',
    specifics: [
      'Sign in from the web or from a device',
      'The same guard on client and server',
    ],
    status: 'soon',
  },
];
