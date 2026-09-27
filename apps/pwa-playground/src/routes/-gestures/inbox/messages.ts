/** A placeholder message in the feed. */
export type Message = {
  readonly id: number;
  readonly from: string;
  readonly subject: string;
  readonly preview: string;
  readonly hue: 6 | 7 | 8 | 9;
};

const FROM = [
  'Ada',
  'Grace',
  'Linus',
  'Margaret',
  'Alan',
  'Barbara',
  'Ken',
  'Radia',
];
const SUBJECT = [
  'Standup notes',
  'Lunch on Friday?',
  'Build is green again',
  'Design review moved',
  'Your trip itinerary',
  'Invoice #2041',
  'Quick question',
  'Weekend plans',
  'Offsite photos',
];
const PREVIEW = [
  'Here is what we covered this morning, and who picks up what next.',
  'There is a new place round the corner that does good noodles.',
  'The flaky test was a clock issue. Fixed and merged.',
  'Moving it to Thursday so everyone can make it.',
  'Check-in opens a day ahead. Seats are together.',
  'Attached, due at the end of the month.',
  'Do you know where the old dashboards went?',
  'Thinking of a hike if the weather holds.',
  'Uploaded them to the shared album last night.',
];
const HUES = [6, 7, 8, 9] as const;

/** The `index`th placeholder message: the same one every time. */
export const message = (index: number): Message => ({
  id: index,
  from: FROM[index % FROM.length] ?? '',
  subject: SUBJECT[(index * 5) % SUBJECT.length] ?? '',
  preview: PREVIEW[(index * 7) % PREVIEW.length] ?? '',
  hue: HUES[index % HUES.length] ?? 6,
});

export const firstMessages = (count: number) =>
  Array.from({ length: count }, (_, index) => message(index));
