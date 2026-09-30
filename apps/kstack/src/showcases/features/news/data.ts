import {
  CpuIcon,
  GlobeIcon,
  type LucideIcon,
  NewspaperIcon,
  PaletteIcon,
  TrophyIcon,
} from '@kstackz/ui-toolkit/lucide';

export interface Tab {
  readonly id: string;
  readonly title: string;
  readonly icon: LucideIcon;
}

/** The sections, in the order the tabs show them. */
export const TABS: ReadonlyArray<Tab> = [
  { id: 'top', title: 'Top', icon: NewspaperIcon },
  { id: 'world', title: 'World', icon: GlobeIcon },
  { id: 'tech', title: 'Tech', icon: CpuIcon },
  { id: 'sport', title: 'Sport', icon: TrophyIcon },
  { id: 'culture', title: 'Culture', icon: PaletteIcon },
];

export interface Article {
  readonly id: string;
  readonly tab: string;
  readonly title: string;
  readonly source: string;
  /** Minutes since it was published. */
  readonly age: number;
  readonly minutes: number;
  /** The thumbnail's hue. */
  readonly hue: number;
  readonly summary: string;
}

let next = 0;
const article = (
  tab: string,
  title: string,
  source: string,
  age: number,
  minutes: number,
  hue: number,
  summary: string,
): Article => ({
  id: `a${++next}`,
  tab,
  title,
  source,
  age,
  minutes,
  hue,
  summary,
});

export const ARTICLES: ReadonlyArray<Article> = [
  article(
    'top',
    'City approves an overnight bus network after a two-year trial',
    'The Ledger',
    12,
    4,
    220,
    'Twelve routes will run every twenty minutes from midnight to five, starting in January.',
  ),
  article(
    'top',
    'Heat warnings extended as nights stay above 25°C',
    'Daily Current',
    38,
    3,
    30,
    'Forecasters expect the hot spell to last into next week, with the first rain on Thursday at the earliest.',
  ),
  article(
    'top',
    'Central bank holds rates and hints at a cut before year end',
    'Northwind',
    64,
    6,
    150,
    'The decision was unanimous; the governor said inflation is “finally behaving”.',
  ),
  article(
    'top',
    'Rail strike called off hours before it was due to start',
    'The Courier',
    95,
    2,
    0,
    'Unions accepted a revised offer late on Sunday night; all services run as normal.',
  ),
  article(
    'top',
    'New tunnel cuts the ferry crossing to twelve minutes',
    'The Ledger',
    140,
    5,
    190,
    'Nine years in the making, the tunnel opens to cars on Friday and to cyclists a week later.',
  ),
  article(
    'top',
    'Hospitals trial a four-day rota for junior doctors',
    'Northwind',
    210,
    7,
    340,
    'Six hospitals will run the trial for a year before a decision on a wider rollout.',
  ),
  article(
    'top',
    'Record turnout expected in Sunday’s regional vote',
    'Daily Current',
    300,
    4,
    260,
    'Early postal votes are already double the last election’s total.',
  ),
  article(
    'top',
    'Water bills to fall for the first time in a decade',
    'The Courier',
    420,
    3,
    200,
    'The average household will pay £38 less a year from April.',
  ),
  article(
    'world',
    'Coastal nations sign a pact to protect migrating whales',
    'Northwind',
    20,
    5,
    210,
    'Shipping lanes will move up to forty kilometres during the spring migration.',
  ),
  article(
    'world',
    'Drought brings river shipping to a standstill',
    'The Ledger',
    55,
    6,
    45,
    'Barges are running at a quarter of their load as water levels hit a 70-year low.',
  ),
  article(
    'world',
    'A border reopens after three years and families reunite',
    'Daily Current',
    80,
    4,
    120,
    'Crowds gathered at dawn at the crossing, which will open twelve hours a day.',
  ),
  article(
    'world',
    'Aid convoy reaches a flooded valley as roads clear',
    'The Courier',
    150,
    3,
    180,
    'Forty trucks carried water, generators and medical supplies to eleven villages.',
  ),
  article(
    'world',
    'Island nation moves its capital inland',
    'Northwind',
    240,
    8,
    170,
    'Rising seas make the move “a question of when, not if”, the planning minister said.',
  ),
  article(
    'world',
    'Summit ends without a deal on fishing quotas',
    'The Ledger',
    360,
    5,
    230,
    'Delegates will meet again in March after talks ran twelve hours over schedule.',
  ),
  article(
    'tech',
    'The phone battery that lasts a week is almost here',
    'Signal',
    15,
    6,
    280,
    'Silicon-carbon cells are shipping in three phones this autumn, with more next year.',
  ),
  article(
    'tech',
    'Open maps overtake paid rivals for cyclists',
    'Signal',
    70,
    4,
    140,
    'Volunteers mapped two million kilometres of bike lanes in the past year alone.',
  ),
  article(
    'tech',
    'Why every app suddenly wants to be your calendar',
    'Northwind',
    110,
    7,
    300,
    'Notes, mail and chat apps are all adding schedules. Users are not convinced.',
  ),
  article(
    'tech',
    'Chip shortage eases, but prices stay high',
    'The Ledger',
    190,
    5,
    60,
    'Lead times are back to normal; list prices have not moved since the peak.',
  ),
  article(
    'tech',
    'A browser built for reading, not for tabs',
    'Signal',
    280,
    4,
    250,
    'It opens every link as a page in one long, quiet scroll.',
  ),
  article(
    'tech',
    'Satellite texting comes to budget phones',
    'Daily Current',
    400,
    3,
    210,
    'Messages take about thirty seconds to send, and the first fifty a month are free.',
  ),
  article(
    'sport',
    'Late winner sends the underdogs into the cup final',
    'Field & Pitch',
    25,
    3,
    130,
    'A header in the 94th minute ended a run of eleven semi-final defeats.',
  ),
  article(
    'sport',
    'Marathon record falls on a cold, flat morning',
    'Field & Pitch',
    90,
    4,
    20,
    'The winner ran the second half forty seconds faster than the first.',
  ),
  article(
    'sport',
    'Rookie keeper saves three penalties in a shootout',
    'Daily Current',
    130,
    2,
    100,
    'The 19-year-old was only playing because of an injury in the warm-up.',
  ),
  article(
    'sport',
    'Cycling team drops its leader after a crash in the Alps',
    'Northwind',
    220,
    5,
    350,
    'He will return next season; the team rides for its sprinter from here.',
  ),
  article(
    'sport',
    'A 17-year-old reaches her first major quarterfinal',
    'Field & Pitch',
    330,
    4,
    310,
    'She has not dropped a set all tournament.',
  ),
  article(
    'culture',
    'A 400-page novel about one afternoon tops the charts',
    'Overture',
    40,
    6,
    20,
    'The debut has sold 200,000 copies in six weeks, mostly by word of mouth.',
  ),
  article(
    'culture',
    'The museum that lets you touch everything',
    'Overture',
    100,
    5,
    80,
    'Every object in its new wing can be held, including a 3,000-year-old bowl.',
  ),
  article(
    'culture',
    'A debut shot on a phone wins the film festival',
    'Daily Current',
    170,
    4,
    290,
    'The director edited it on a laptop over two summers.',
  ),
  article(
    'culture',
    'Why vinyl outsold streaming at one tiny record shop',
    'The Ledger',
    260,
    7,
    10,
    'The owner’s secret: no website, and a listening booth for every customer.',
  ),
  article(
    'culture',
    'A theatre reopens after 30 years with a sold-out run',
    'Overture',
    380,
    4,
    320,
    'Volunteers restored its 800 seats one at a time.',
  ),
];

/** What a pull to refresh finds in each tab, newest first. */
export const INCOMING: Readonly<Record<string, ReadonlyArray<Article>>> = {
  top: [
    article(
      'top',
      'Power back for 40,000 homes after the storm',
      'The Courier',
      0,
      2,
      50,
      'Crews worked through the night; the last streets should be back by noon.',
    ),
    article(
      'top',
      'Bridge reopens a week early',
      'The Ledger',
      0,
      2,
      200,
      'Repairs finished ahead of schedule thanks to the dry weather.',
    ),
  ],
  world: [
    article(
      'world',
      'Ceasefire holds for a second night',
      'Northwind',
      0,
      3,
      160,
      'Observers reported no violations along the line since Tuesday.',
    ),
  ],
  tech: [
    article(
      'tech',
      'Messaging app adds edit history',
      'Signal',
      0,
      2,
      270,
      'Anyone in a chat can now see every version of an edited message.',
    ),
  ],
  sport: [
    article(
      'sport',
      'Captain signs a two-year extension',
      'Field & Pitch',
      0,
      2,
      110,
      'He will be 36 when the new deal ends.',
    ),
  ],
  culture: [
    article(
      'culture',
      'A lost jazz recording turns up in an attic',
      'Overture',
      0,
      3,
      40,
      'The tapes, from 1961, will be released in the spring.',
    ),
  ],
};

/** The rest of every article, after its summary. */
export const BODY: ReadonlyArray<string> = [
  'Officials said the details would be published in full later this week, and that the first changes would be visible within a month. Not everyone is persuaded: critics say the timetable is ambitious and the funding only secured for the first year.',
  'For most people the difference will be small at first. Those who are affected most were consulted over the summer, and many of their suggestions made it into the final plan, including a review after six months.',
  'What happens next depends on how the first weeks go. “We will know quickly whether this works,” one of those involved said. “And if it doesn’t, we will say so.”',
];

/** How long ago, briefly: “now”, “12m”, “3h”. */
export const ago = (minutes: number) =>
  minutes < 1
    ? 'now'
    : minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h`;
