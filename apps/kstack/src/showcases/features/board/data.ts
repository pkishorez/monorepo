/** The columns every board has, left to right. */
export const COLUMNS = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
] as const;

export type ColumnId = (typeof COLUMNS)[number]['id'];

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly tag: { readonly label: string; readonly hue: number };
  readonly assignee: string;
  readonly due?: string;
  readonly comments?: number;
}

export interface Board {
  readonly id: string;
  readonly name: string;
  readonly hue: number;
  readonly columns: Readonly<Record<ColumnId, ReadonlyArray<Task>>>;
}

const MARKETING = { label: 'Marketing', hue: 330 };
const PRODUCT = { label: 'Product', hue: 260 };
const BILLING = { label: 'Billing', hue: 150 };
const BUG = { label: 'Bug', hue: 25 };
const DESIGN = { label: 'Design', hue: 200 };
const OPS = { label: 'Ops', hue: 80 };

let next = 0;
const task = (
  title: string,
  tag: Task['tag'],
  assignee: string,
  extra: { due?: string; comments?: number } = {},
): Task => ({ id: `t${++next}`, title, tag, assignee, ...extra });

export const BOARDS: ReadonlyArray<Board> = [
  {
    id: 'launch',
    name: 'Launch',
    hue: 260,
    columns: {
      todo: [
        task('Write the launch blog post', MARKETING, 'AK', {
          due: 'Oct 3',
          comments: 4,
        }),
        task('Record a 60-second demo video', MARKETING, 'JL', {
          due: 'Oct 4',
        }),
        task('Press kit: logos and screenshots', DESIGN, 'MR'),
        task('Set up the public status page', OPS, 'SP', { comments: 1 }),
        task('Pricing FAQ for the docs', BILLING, 'AK'),
        task('Launch-day support rota', OPS, 'DN', { due: 'Oct 6' }),
        task('Changelog entry for 2.0', PRODUCT, 'JL'),
        task('Move the waitlist to real accounts', PRODUCT, 'SP', {
          comments: 5,
        }),
        task('Referral credits', BILLING, 'MR', { due: 'Oct 10' }),
        task('Localise the pricing page', MARKETING, 'DN'),
      ],
      doing: [
        task('Onboarding checklist copy', PRODUCT, 'MR', { comments: 7 }),
        task('Retry failed Stripe webhooks', BILLING, 'SP', { due: 'Oct 2' }),
        task('Landing page hero', DESIGN, 'AK', { comments: 3 }),
      ],
      review: [
        task('Invite teammates by link', PRODUCT, 'DN', { comments: 12 }),
        task('Usage limits on the free plan', BILLING, 'JL', { due: 'Oct 1' }),
      ],
      done: [
        task('Beta feedback survey', PRODUCT, 'MR'),
        task('Rename workspace setting', PRODUCT, 'SP', { comments: 2 }),
        task('CSV export uses the wrong timezone', BUG, 'DN'),
        task('Status emails in dark mode', DESIGN, 'AK'),
      ],
    },
  },
  {
    id: 'website',
    name: 'Website',
    hue: 200,
    columns: {
      todo: [
        task('Customer stories page', MARKETING, 'JL', { due: 'Oct 9' }),
        task('Compress hero video', OPS, 'SP'),
        task('Cookie banner copy', MARKETING, 'AK', { comments: 2 }),
      ],
      doing: [
        task('New pricing table', DESIGN, 'MR', { comments: 5 }),
        task('Docs search is slow', BUG, 'DN', { due: 'Oct 2' }),
      ],
      review: [task('Footer links audit', MARKETING, 'JL')],
      done: [
        task('Move blog to the new CMS', OPS, 'SP', { comments: 9 }),
        task('Open Graph images', DESIGN, 'AK'),
      ],
    },
  },
  {
    id: 'mobile',
    name: 'Mobile app',
    hue: 30,
    columns: {
      todo: [
        task('Offline drafts', PRODUCT, 'DN', { comments: 6 }),
        task('Haptics on long press', DESIGN, 'MR'),
        task('Crash on rotate in the editor', BUG, 'SP', { due: 'Oct 1' }),
        task('App Store screenshots', MARKETING, 'JL'),
      ],
      doing: [
        task('Push notification settings', PRODUCT, 'AK', { comments: 3 }),
      ],
      review: [
        task('Widget for today’s tasks', DESIGN, 'MR', { due: 'Oct 5' }),
        task('In-app purchase receipts', BILLING, 'DN'),
      ],
      done: [task('Sign in with Apple', PRODUCT, 'SP')],
    },
  },
];

/** What a pull to refresh brings in: a teammate's newest task. */
const INCOMING: ReadonlyArray<Omit<Task, 'id'>> = [
  { title: 'Reply to the Hacker News thread', tag: MARKETING, assignee: 'JL' },
  {
    title: 'Invoice PDF has no VAT number',
    tag: BUG,
    assignee: 'SP',
    comments: 1,
  },
  { title: 'Empty state for search', tag: DESIGN, assignee: 'MR' },
  {
    title: 'Rotate the API signing keys',
    tag: OPS,
    assignee: 'DN',
    due: 'Oct 8',
  },
  { title: 'Annual plan discount', tag: BILLING, assignee: 'AK' },
];

/** The next task a refresh finds. */
export const incoming = (): Task => {
  const found = INCOMING[next % INCOMING.length];
  return { ...found, id: `t${++next}` };
};
