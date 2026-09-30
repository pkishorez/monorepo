/** Who sent a Message: you, or the other side. */
export type Side = 'me' | 'them';

/** The Message a reply quotes. */
export interface Quote {
  readonly author: string;
  readonly text: string;
}

export interface Message {
  readonly id: string;
  readonly side: Side;
  /** Who wrote it, in a group. */
  readonly author?: string;
  readonly text: string;
  /** Epoch ms. */
  readonly at: number;
  readonly reaction?: string;
  readonly replyTo?: Quote;
}

export interface Chat {
  readonly id: string;
  readonly name: string;
  /** The avatar's hue, 0 to 360. */
  readonly hue: number;
  readonly group: boolean;
  readonly online: boolean;
  readonly pinned: boolean;
  readonly muted: boolean;
  /** Messages you have not read. */
  readonly unread: number;
  /** Marked unread by hand, with nothing new in it. */
  readonly markedUnread: boolean;
  readonly messages: ReadonlyArray<Message>;
}

/** The reactions a held Message offers. */
export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'] as const;

// One line of a script: who sent it, what it says, and who in a group.
type Line = readonly [side: Side, text: string, author?: string];

interface Script {
  readonly name: string;
  readonly hue: number;
  readonly group?: boolean;
  readonly online?: boolean;
  readonly pinned?: boolean;
  readonly muted?: boolean;
  readonly unread?: number;
  /** Minutes ago the last line was sent. */
  readonly ago: number;
  /** Minutes between lines. */
  readonly gap?: number;
  readonly lines: ReadonlyArray<Line>;
}

const SCRIPTS: ReadonlyArray<Script> = [
  {
    name: 'Maya Chen',
    hue: 20,
    online: true,
    pinned: true,
    unread: 2,
    ago: 2,
    gap: 3,
    lines: [
      ['them', 'Are you still up for the farmers market tomorrow?'],
      ['me', 'Yes! What time were you thinking?'],
      ['them', 'Early-ish. The good peaches go by 9'],
      ['me', 'Ugh fine. 8:30?'],
      ['them', '8:30 works'],
      ['them', 'I’ll bring the big tote'],
      ['me', 'Perfect. Coffee first though'],
      ['them', 'Obviously ☕️'],
      ['me', 'The place on Alder or the one by the station?'],
      ['them', 'Alder. The station one burned my oat milk last time'],
      ['me', 'Burned. Oat milk.'],
      ['them', 'I don’t know how either'],
      ['me', 'Alder it is'],
      ['them', 'Also, can you bring back my blue dish?'],
      ['me', 'The one with the chip?'],
      ['them', 'It has character'],
      ['me', 'It has a chip'],
      ['them', 'Bring the dish 🙃'],
      ['me', 'Bringing the dish'],
      ['them', 'Leo might join, is that ok?'],
      ['me', 'Of course'],
      ['them', 'Great, he’s driving so we can get the heavy stuff'],
      ['them', 'See you at 8:30!'],
    ],
  },
  {
    name: 'Weekend climbing',
    hue: 150,
    group: true,
    pinned: true,
    unread: 5,
    ago: 11,
    gap: 4,
    lines: [
      ['them', 'Who’s in for Saturday?', 'Ana'],
      ['me', 'Me'],
      ['them', 'In', 'Leo'],
      ['them', 'Maybe, depends on my shoulder', 'Sam'],
      ['them', 'Rest it, Sam', 'Ana'],
      ['them', 'I’ll belay then 😅', 'Sam'],
      ['me', 'Gym or outside?'],
      ['them', 'Outside if it stays dry', 'Ana'],
      ['them', 'Forecast says 20% rain', 'Leo'],
      ['them', 'That’s basically zero', 'Ana'],
      ['me', 'That’s basically a wet crag'],
      ['them', 'Fine. Gym at 10, crag if it’s dry by noon', 'Ana'],
      ['them', 'I can drive 3', 'Leo'],
      ['me', 'I’ll bring the rope'],
      ['them', 'And the snacks', 'Sam'],
      ['me', 'You bring the snacks, you’re belaying'],
      ['them', 'Fair', 'Sam'],
      ['them', 'Meet at mine at 9:30', 'Leo'],
      ['them', 'Don’t forget chalk this time 👀', 'Ana'],
    ],
  },
  {
    name: 'Leo Park',
    hue: 220,
    online: true,
    ago: 34,
    gap: 6,
    lines: [
      ['them', 'Did you see the onboarding copy?'],
      ['me', 'Just now. The second screen is great'],
      ['them', 'The first one feels long to me'],
      ['me', 'Cut the last sentence and it’s fine'],
      ['them', 'Done'],
      ['them', 'Shipping it after lunch'],
      ['me', '🙌'],
      ['them', 'Also, market tomorrow? Maya said you’re in'],
      ['me', 'Yep, 8:30'],
      ['them', 'I’ll pick you up at 8:15'],
      ['me', 'You’re the best'],
      ['them', 'I know'],
    ],
  },
  {
    name: 'Mom',
    hue: 330,
    unread: 1,
    ago: 58,
    gap: 20,
    lines: [
      ['them', 'Did you eat?'],
      ['me', 'Yes mom'],
      ['them', 'What did you eat'],
      ['me', 'Pasta'],
      ['them', 'Vegetables?'],
      ['me', 'There was basil'],
      ['them', 'Basil is not a vegetable'],
      ['them', 'Call me this weekend, your aunt wants to say hi ❤️'],
    ],
  },
  {
    name: 'Ana Ruiz',
    hue: 280,
    ago: 95,
    gap: 5,
    lines: [
      ['them', 'Photos from Saturday are up'],
      ['me', 'The one on the bridge is so good'],
      ['them', 'Right?? The light was unreal'],
      ['me', 'Can I use it for my profile?'],
      ['them', 'Only if you credit me'],
      ['me', 'Photo: Ana Ruiz, genius'],
      ['them', 'Accurate'],
    ],
  },
  {
    name: 'Design team',
    hue: 45,
    group: true,
    muted: true,
    unread: 14,
    ago: 130,
    gap: 3,
    lines: [
      ['them', 'Review moved to Thursday', 'Priya'],
      ['them', 'Same time?', 'Tom'],
      ['them', '2pm, room 4', 'Priya'],
      ['me', 'I’ll have the new icons by then'],
      ['them', 'The 16px set?', 'Tom'],
      ['me', 'And 20. The 12s were too mushy'],
      ['them', 'Agree, drop the 12s', 'Priya'],
      ['them', 'Can someone check the dark mode contrast on cards?', 'Tom'],
      ['me', 'On it'],
      ['them', 'Thanks! Deck is in the shared folder', 'Priya'],
    ],
  },
  {
    name: 'Sam Okafor',
    hue: 100,
    online: true,
    ago: 190,
    gap: 8,
    lines: [
      ['them', 'How’s the shoulder'],
      ['me', 'You tell me, it’s yours'],
      ['them', 'Ha. Better. PT says two more weeks'],
      ['me', 'Take the two weeks'],
      ['them', 'Yes coach'],
    ],
  },
  {
    name: 'Priya Nair',
    hue: 260,
    ago: 60 * 5,
    gap: 4,
    lines: [
      ['them', 'Loved your talk today'],
      ['me', 'Thank you! I was so nervous'],
      ['them', 'Didn’t show at all'],
      ['them', 'Can you send the slides?'],
      ['me', 'Sending tonight'],
    ],
  },
  {
    name: 'Tom Becker',
    hue: 190,
    ago: 60 * 9,
    gap: 10,
    lines: [
      ['them', 'Lunch?'],
      ['me', 'Can’t today, tomorrow?'],
      ['them', 'Tomorrow. Ramen place'],
      ['me', 'Deal'],
    ],
  },
  {
    name: 'Flatmates',
    hue: 75,
    group: true,
    ago: 60 * 20,
    gap: 15,
    lines: [
      ['them', 'Who took the last oat milk', 'Jonas'],
      ['me', 'Not me'],
      ['them', 'Not me', 'Elif'],
      ['them', 'Then who', 'Jonas'],
      ['them', 'I’ll get more on the way home', 'Elif'],
      ['them', 'Bins go out tonight btw', 'Jonas'],
    ],
  },
  {
    name: 'Jonas Weber',
    hue: 10,
    ago: 60 * 26,
    gap: 7,
    lines: [
      ['them', 'Your package came, it’s by your door'],
      ['me', 'Thanks!'],
      ['them', 'It’s huge. What did you buy'],
      ['me', 'A plant'],
      ['them', 'That’s not a plant, that’s a tree'],
    ],
  },
  {
    name: 'Elif Demir',
    hue: 305,
    ago: 60 * 30,
    gap: 12,
    lines: [
      ['me', 'Thanks for the book!'],
      ['them', 'Tell me when you get to chapter 7'],
      ['me', 'Why'],
      ['them', 'You’ll see'],
    ],
  },
  {
    name: 'Dr. Patel’s office',
    hue: 200,
    ago: 60 * 44,
    gap: 60,
    lines: [
      ['them', 'Reminder: your appointment is on Tue at 10:15.'],
      ['me', 'Thank you, see you then'],
      ['them', 'Reply C to confirm, R to reschedule.'],
    ],
  },
  {
    name: 'Noah Kim',
    hue: 240,
    ago: 60 * 50,
    gap: 9,
    lines: [
      ['them', 'Still have my drill?'],
      ['me', 'Yes, sorry! Dropping it off Sunday'],
      ['them', 'No rush'],
    ],
  },
  {
    name: 'Book club',
    hue: 30,
    group: true,
    muted: true,
    ago: 60 * 70,
    gap: 25,
    lines: [
      ['them', 'Next pick?', 'Grace'],
      ['them', 'Something short please', 'Noah'],
      ['me', 'Piranesi?'],
      ['them', 'Yes!!', 'Grace'],
      ['them', 'Piranesi it is. The 14th, at mine', 'Grace'],
    ],
  },
  {
    name: 'Grace Liu',
    hue: 350,
    ago: 60 * 96,
    gap: 6,
    lines: [
      ['them', 'Is it ok if I bring Noah’s sister?'],
      ['me', 'Of course'],
      ['them', 'Yay'],
    ],
  },
  {
    name: 'Omar Haddad',
    hue: 170,
    ago: 60 * 120,
    gap: 30,
    lines: [
      ['me', 'Happy birthday!! 🎉'],
      ['them', 'Thank you!! Drinks Friday?'],
      ['me', 'Wouldn’t miss it'],
    ],
  },
  {
    name: 'Lucía Romero',
    hue: 0,
    ago: 60 * 170,
    gap: 4,
    lines: [
      [
        'them',
        'The recipe you asked for: 2 cups flour, 1 egg, a pinch of salt',
      ],
      ['me', 'That’s it?'],
      ['them', 'And love'],
    ],
  },
  {
    name: 'Kenji Sato',
    hue: 210,
    ago: 60 * 24 * 9,
    gap: 40,
    lines: [
      ['them', 'Landed in Osaka!'],
      ['me', 'Eat everything'],
      ['them', 'That’s the plan'],
    ],
  },
  {
    name: 'Hannah Moss',
    hue: 125,
    ago: 60 * 24 * 21,
    gap: 15,
    lines: [
      ['me', 'Great meeting you at the conference'],
      ['them', 'Likewise! Let’s keep in touch'],
    ],
  },
];

/** A handful of messages that arrive on each refresh, in turn. */
export const INCOMING: ReadonlyArray<{
  readonly chat: string;
  readonly text: string;
  readonly author?: string;
}> = [
  { chat: 'omar-haddad', text: 'Friday, 8pm, the usual place?' },
  { chat: 'tom-becker', text: 'Ramen is closed. Tacos?' },
  { chat: 'flatmates', text: 'Found the oat milk thief 👀', author: 'Elif' },
  { chat: 'kenji-sato', text: 'Brought you back something' },
];

/** A name as the id the app keys a Chat by. */
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Every Chat, their last messages placed back from `now`. */
export const createChats = (now: number): ReadonlyArray<Chat> =>
  SCRIPTS.map((script) => {
    const id = slugOf(script.name);
    const gap = script.gap ?? 5;
    const last = now - script.ago * 60_000;
    const count = script.lines.length;
    return {
      id,
      name: script.name,
      hue: script.hue,
      group: script.group ?? false,
      online: script.online ?? false,
      pinned: script.pinned ?? false,
      muted: script.muted ?? false,
      unread: script.unread ?? 0,
      markedUnread: false,
      messages: script.lines.map(([side, text, author], i) => ({
        id: `${id}-${i}`,
        side,
        text,
        at: last - (count - 1 - i) * gap * 60_000,
        ...(author === undefined ? {} : { author }),
      })),
    };
  });

/** The last Message of a Chat. */
export const lastOf = (chat: Chat) => chat.messages.at(-1);

/** Pinned first, then the latest message first. */
export const sortChats = (chats: ReadonlyArray<Chat>) =>
  [...chats].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (lastOf(b)?.at ?? 0) - (lastOf(a)?.at ?? 0),
  );

/** You: the account signed in. */
export const ME = {
  name: 'Alex Morgan',
  phone: '+1 415 555 0132',
  hue: 250,
  group: false,
  online: false,
} as const;
