import {
  ArchiveIcon,
  FileTextIcon,
  InboxIcon,
  type LucideIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
} from '@kstackz/ui-toolkit/lucide';

/** Where a mail lives. */
export type Place = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';

/** What the folders list: every place, and the starred mail from all but the trash. */
export type FolderId = Place | 'starred';

export interface Mail {
  readonly id: string;
  /** Who it is from, or to, for sent mail and drafts. */
  readonly from: string;
  readonly email: string;
  readonly subject: string;
  /** Paragraphs split by a blank line; the first is the preview. */
  readonly body: string;
  readonly time: string;
  readonly unread: boolean;
  readonly starred: boolean;
  readonly attachment?: string;
  readonly folder: Place;
}

export interface Folder {
  readonly id: FolderId;
  readonly title: string;
  readonly icon: LucideIcon;
}

export const FOLDERS: ReadonlyArray<Folder> = [
  { id: 'inbox', title: 'Inbox', icon: InboxIcon },
  { id: 'starred', title: 'Starred', icon: StarIcon },
  { id: 'sent', title: 'Sent', icon: SendIcon },
  { id: 'drafts', title: 'Drafts', icon: FileTextIcon },
  { id: 'archive', title: 'Archive', icon: ArchiveIcon },
  { id: 'trash', title: 'Trash', icon: Trash2Icon },
];

/** Whether `mail` shows in `folder`. */
export const inFolder = (mail: Mail, folder: FolderId) =>
  folder === 'starred'
    ? mail.starred && mail.folder !== 'trash'
    : mail.folder === folder;

/** The mailbox's owner. */
export const ME = { name: 'Sam Rivera', email: 'sam@northwind.dev' };

type Seed = Omit<Mail, 'id' | 'unread' | 'starred' | 'folder'> &
  Partial<Pick<Mail, 'unread' | 'starred' | 'folder'>>;

const SEEDS: ReadonlyArray<Seed> = [
  {
    from: 'Maya Chen',
    email: 'maya@northwind.dev',
    subject: 'Launch checklist for Thursday',
    body: 'I went through the list again this morning. Two things are still open: the pricing page copy and the status page webhook.\n\nCan you take the webhook? I can pair after lunch if that helps.\n\nMaya',
    time: '9:41 AM',
    unread: true,
    starred: true,
  },
  {
    from: 'GitHub',
    email: 'notifications@github.com',
    subject: '[northwind/app] Fix the flaky sync test (#1284)',
    body: 'jonas-w approved these changes. Looks good to me, the retry is scoped to the one call that needs it.\n\nView it on GitHub or reply to this email directly.',
    time: '9:12 AM',
    unread: true,
  },
  {
    from: 'Linear',
    email: 'notifications@linear.app',
    subject: 'NW-412 was assigned to you',
    body: 'Offline drafts lose their attachments after a reload. Priority: High. Cycle: Sep 29 – Oct 12.\n\nOpen the issue to see the full description.',
    time: '8:57 AM',
    unread: true,
  },
  {
    from: 'Jonas Weber',
    email: 'jonas@northwind.dev',
    subject: 'Re: Gesture timings',
    body: 'Tried the new sidebar spring on my phone. It feels a lot tighter, especially closing. I would keep it.\n\nOne nit: the scrim could fade a touch faster.',
    time: '8:30 AM',
  },
  {
    from: 'Stripe',
    email: 'receipts@stripe.com',
    subject: 'Your receipt from Northwind Inc. #2291-4410',
    body: 'Amount paid: $49.00. Date paid: Sep 30, 2026. Payment method: Visa ending in 4242.\n\nIf you have any questions, contact us at support@stripe.com.',
    time: '7:02 AM',
    attachment: 'receipt-2291-4410.pdf',
  },
  {
    from: 'Priya Natarajan',
    email: 'priya@heron.studio',
    subject: 'Design review notes',
    body: 'Thanks for walking us through it yesterday. I wrote up the notes and the three screens we want to revisit.\n\nThe big one is the empty inbox: it should feel calm, not broken.',
    time: 'Yesterday',
    unread: true,
    attachment: 'review-notes.pdf',
  },
  {
    from: 'Vercel',
    email: 'notifications@vercel.com',
    subject: 'Deployment ready: northwind-app',
    body: 'Your deployment of main is ready. Preview: northwind-app-git-main.vercel.app\n\nBuilt in 41s.',
    time: 'Yesterday',
  },
  {
    from: 'Alex Kim',
    email: 'alex.kim@gmail.com',
    subject: 'Dinner Saturday?',
    body: 'We are doing that ramen place on 5th around 7. Lena and Tom are in. You coming?\n\nAlso bring the board game, the long one.',
    time: 'Yesterday',
    starred: true,
  },
  {
    from: 'Figma',
    email: 'no-reply@figma.com',
    subject: 'Priya mentioned you in Mail — Mobile',
    body: '"@sam can we try the swipe actions at 72px each? 80 feels wide on the mini."\n\nReply in Figma.',
    time: 'Yesterday',
  },
  {
    from: 'Notion',
    email: 'notify@notion.so',
    subject: 'Weekly digest: Engineering',
    body: '12 pages were edited this week. Most active: Release process, On-call handbook, Q4 roadmap.\n\nOpen Notion to catch up.',
    time: 'Mon',
  },
  {
    from: 'Lena Fischer',
    email: 'lena@northwind.dev',
    subject: 'On-call handover',
    body: 'Quiet week. One page on Saturday for the queue backlog, resolved by scaling the workers. Runbook updated.\n\nYou are on from Monday 9:00.',
    time: 'Mon',
    unread: true,
  },
  {
    from: 'Calendly',
    email: 'notifications@calendly.com',
    subject: 'New event: Intro call with Dana Ortiz',
    body: 'Thursday, Oct 2, 2:00 PM – 2:30 PM. Invitee: dana@brightline.io\n\nA calendar invitation has been sent to your email address.',
    time: 'Mon',
    attachment: 'invite.ics',
  },
  {
    from: 'AWS',
    email: 'no-reply@aws.amazon.com',
    subject: 'Your AWS bill for September is available',
    body: 'Your bill for the period Sep 1 – Sep 30 is $318.42. View the details in the Billing console.\n\nThis is an automated message.',
    time: 'Sun',
  },
  {
    from: 'Tom Becker',
    email: 'tom@becker.io',
    subject: 'Photos from the hike',
    body: 'Finally sorted them. The one at the ridge came out great, the fog was unreal.\n\nFull album in the link, grab whatever you like.',
    time: 'Sun',
    attachment: 'ridge.jpg',
  },
  {
    from: 'Dana Ortiz',
    email: 'dana@brightline.io',
    subject: 'Quick intro before Thursday',
    body: 'Looking forward to the call. For context, we are a team of six moving our field app to a PWA and hitting walls with gestures on iOS.\n\nA few questions attached.',
    time: 'Sat',
    unread: true,
    attachment: 'questions.pdf',
  },
  {
    from: 'Hacker Newsletter',
    email: 'kale@hackernewsletter.com',
    subject: '#712: Local-first, spring physics, tiny databases',
    body: 'This week: why springs beat curves for interruptible motion, a 400-line database, and the case for boring tech.\n\nEnjoy the read.',
    time: 'Sat',
  },
  {
    from: 'Ben Carter',
    email: 'ben@northwind.dev',
    subject: 'Offsite dates',
    body: 'Three options: Nov 6–7, Nov 13–14, or Nov 20–21. Vote in the thread by Friday.\n\nSame cabin as last year if we pick the first one.',
    time: 'Fri',
  },
  {
    from: 'Slack',
    email: 'feedback@slack.com',
    subject: 'You have 4 unread messages in #mobile',
    body: 'Jonas: shipped the new sidebar. Priya: 🎉. Maya: can someone check it on Android?\n\nOpen Slack to reply.',
    time: 'Fri',
  },
  {
    from: 'Apple',
    email: 'no_reply@email.apple.com',
    subject: 'Your receipt from Apple',
    body: 'iCloud+ with 200 GB storage. Billed monthly. $2.99.\n\nKeep this for your records.',
    time: 'Sep 25',
  },
  {
    from: 'Maya Chen',
    email: 'maya@northwind.dev',
    subject: 'Pricing page draft',
    body: 'Here is the first pass. I cut the comparison table down to five rows; nobody reads past that.\n\nComments welcome, especially on the FAQ.',
    time: 'Sep 24',
    attachment: 'pricing-v1.pdf',
  },
  {
    from: 'Jonas Weber',
    email: 'jonas@northwind.dev',
    subject: 'Pull to refresh on iOS',
    body: 'Found why it fought the page bounce: the list was not the element that scrolled. Fixed on main.\n\nNo more double spinner.',
    time: 'Sep 23',
  },
  {
    from: 'Duolingo',
    email: 'hello@duolingo.com',
    subject: 'You are on a 41 day streak 🔥',
    body: 'Keep it going with a five minute lesson today.\n\nDuo believes in you.',
    time: 'Sep 22',
  },
  // Sent
  {
    from: 'Maya Chen',
    email: 'maya@northwind.dev',
    subject: 'Re: Launch checklist for Thursday',
    body: 'Yes, I will take the webhook. Should be done by end of day.\n\nSam',
    time: '9:50 AM',
    folder: 'sent',
  },
  {
    from: 'Alex Kim',
    email: 'alex.kim@gmail.com',
    subject: 'Re: Dinner Saturday?',
    body: 'In. I will bring the long one, you have been warned.',
    time: 'Yesterday',
    folder: 'sent',
  },
  {
    from: 'Dana Ortiz',
    email: 'dana@brightline.io',
    subject: 'Re: Quick intro before Thursday',
    body: 'Thanks Dana, I read through the questions. Most of them come down to who owns the touch, happy to show it live.',
    time: 'Sat',
    folder: 'sent',
  },
  // Drafts
  {
    from: 'Ben Carter',
    email: 'ben@northwind.dev',
    subject: 'Re: Offsite dates',
    body: 'Nov 13–14 works best for me, the first one clashes with',
    time: 'Fri',
    folder: 'drafts',
  },
  {
    from: 'Priya Natarajan',
    email: 'priya@heron.studio',
    subject: 'Empty states',
    body: 'Two ideas for the empty inbox:',
    time: 'Sep 24',
    folder: 'drafts',
  },
  // Archive
  {
    from: 'Lena Fischer',
    email: 'lena@northwind.dev',
    subject: 'Q3 retro notes',
    body: 'What went well: shipping cadence, fewer pages. What to change: less work in progress, clearer owners.\n\nFull notes in the doc.',
    time: 'Sep 19',
    folder: 'archive',
    starred: true,
  },
  {
    from: 'Airbnb',
    email: 'automated@airbnb.com',
    subject: 'Your reservation is confirmed',
    body: 'Cabin by the lake. Nov 6 – Nov 8. 6 guests.\n\nCheck-in after 3:00 PM.',
    time: 'Sep 12',
    folder: 'archive',
    attachment: 'itinerary.pdf',
  },
  // Trash
  {
    from: 'Webinar Hub',
    email: 'events@webinarhub.io',
    subject: 'Last chance: 10 growth hacks for 2027',
    body: 'Seats are filling up fast. Reserve yours now.',
    time: 'Sep 20',
    folder: 'trash',
  },
];

export const MAILS: ReadonlyArray<Mail> = SEEDS.map((seed, i) => ({
  unread: false,
  starred: false,
  folder: 'inbox',
  ...seed,
  id: `m${i}`,
}));

const ARRIVALS: ReadonlyArray<Seed> = [
  {
    from: 'Maya Chen',
    email: 'maya@northwind.dev',
    subject: 'Webhook looks good',
    body: 'Just tested it against staging, the status page flips within a second. Merging.',
    time: 'Now',
  },
  {
    from: 'GitHub',
    email: 'notifications@github.com',
    subject: '[northwind/app] Release v2.8.0 published',
    body: 'Offline drafts keep their attachments, a faster sidebar, and 14 other fixes.',
    time: 'Now',
  },
  {
    from: 'Jonas Weber',
    email: 'jonas@northwind.dev',
    subject: 'Coffee?',
    body: 'Heading down in ten, want anything?',
    time: 'Now',
  },
  {
    from: 'Linear',
    email: 'notifications@linear.app',
    subject: 'NW-418 was moved to In Review',
    body: 'Swipe actions collapse the row before the undo toast appears.',
    time: 'Now',
  },
  {
    from: 'Dana Ortiz',
    email: 'dana@brightline.io',
    subject: 'Moving our call?',
    body: 'Something came up on Thursday. Could we do Friday at the same time?',
    time: 'Now',
  },
];

/** The `n`th mail to arrive on a refresh: new, unread, in the inbox. */
export const arrival = (n: number): Mail => ({
  ...ARRIVALS[n % ARRIVALS.length],
  id: `new${n}`,
  unread: true,
  starred: false,
  folder: 'inbox',
});
