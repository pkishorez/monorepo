import { dayOf } from './month.ts';
import type { Account, Category, Entry } from './schemas.ts';

type Draft = {
  readonly accounts: ReadonlyArray<Account>;
  readonly categories: ReadonlyArray<Category>;
  readonly entries: ReadonlyArray<Entry>;
};

// [name, icon, budget in whole money a month, way]
const CATEGORIES = [
  ['Food', 'utensils', 450, 'out'],
  ['Coffee', 'coffee', 60, 'out'],
  ['Rent', 'house', 1600, 'out'],
  ['Transport', 'car', 180, 'out'],
  ['Shopping', 'shopping-bag', 250, 'out'],
  ['Fun', 'film', 120, 'out'],
  ['Health', 'heart-pulse', 0, 'out'],
  ['Salary', 'briefcase', 0, 'in'],
  ['Gifts', 'gift', 0, 'in'],
  ['Interest', 'piggy-bank', 0, 'in'],
] as const;

// [category, memos, cents from, cents to, times a month, account]
const HABITS = [
  [
    'Coffee',
    ['Flat white', 'Cold brew', 'Espresso', 'Chai latte'],
    350,
    650,
    14,
    'card',
  ],
  [
    'Food',
    ['Groceries', 'Lunch', 'Dinner out', 'Bakery', 'Farmers market'],
    900,
    6500,
    12,
    'card',
  ],
  [
    'Transport',
    ['Metro card', 'Taxi home', 'Fuel', 'Bike repair'],
    250,
    4800,
    6,
    'card',
  ],
  [
    'Shopping',
    ['Books', 'Running shoes', 'Kitchen things', 'Gift for Sam'],
    1500,
    9000,
    3,
    'card',
  ],
  [
    'Fun',
    ['Cinema', 'Concert', 'Board games night', 'Museum'],
    1200,
    6000,
    3,
    'cash',
  ],
  ['Health', ['Pharmacy', 'Gym', 'Dentist'], 1500, 7000, 1, 'bank'],
] as const;

// A fixed stream of numbers, so the same user gets the same sample.
const randomOf = (seed: string) => {
  let state = [...seed].reduce(
    (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619),
    2166136261,
  );
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
};

/**
 * Accounts, Categories and three Months of Entries up to `now` for one
 * user, as a person's real money would look: rent and salary once a
 * Month, coffee most days. `id` names each new thing.
 */
export const sample = (userId: string, now: Date, id: () => string): Draft => {
  const random = randomOf(userId);
  const at = now.toISOString();
  const account = (name: string, kind: Account['kind']): Account => ({
    id: id(),
    userId,
    name,
    kind,
    createdAt: at,
  });
  const accounts = {
    cash: account('Cash', 'cash'),
    bank: account('Bank', 'bank'),
    card: account('Card', 'card'),
    savings: account('Savings', 'savings'),
  };
  const categories = new Map<string, Category>(
    CATEGORIES.map(([name, icon, budget, way]) => [
      name,
      {
        id: id(),
        userId,
        name,
        icon,
        budget: budget * 100,
        way,
        createdAt: at,
      } satisfies Category,
    ]),
  );
  const entries: Entry[] = [];
  const add = (
    category: string,
    memo: string,
    cents: number,
    day: Date,
    accountKind: keyof typeof accounts,
  ) => {
    const of = categories.get(category);
    if (of === undefined || day > now) return;
    entries.push({
      id: id(),
      userId,
      accountId: accounts[accountKind].id,
      categoryId: of.id,
      cents,
      way: of.way,
      memo,
      day: dayOf(day),
      createdAt: new Date(day.getTime() + entries.length).toISOString(),
    });
  };
  const pick = <T>(list: ReadonlyArray<T>) =>
    list[Math.floor(random() * list.length)] as T;

  for (let back = 2; back >= 0; back--) {
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1, 9);
    const days = new Date(
      first.getFullYear(),
      first.getMonth() + 1,
      0,
    ).getDate();
    const dayAt = (date: number) =>
      new Date(
        first.getFullYear(),
        first.getMonth(),
        date,
        8 + Math.floor(random() * 12),
      );
    add('Salary', 'Salary', 520000, dayAt(1), 'bank');
    add('Rent', 'Rent', 160000, dayAt(2), 'bank');
    add(
      'Interest',
      back === 2 ? 'Opening balance' : 'Interest',
      back === 2 ? 1250000 : 1840,
      dayAt(days),
      'savings',
    );
    for (const [category, memos, from, to, times, kind] of HABITS) {
      for (let n = 0; n < times; n++) {
        const cents = Math.round((from + random() * (to - from)) / 5) * 5;
        add(
          category,
          pick(memos),
          cents,
          dayAt(1 + Math.floor(random() * days)),
          kind,
        );
      }
    }
    if (random() > 0.5)
      add(
        'Gifts',
        'Birthday money',
        5000,
        dayAt(10 + Math.floor(random() * 10)),
        'cash',
      );
  }
  return {
    accounts: Object.values(accounts),
    categories: [...categories.values()],
    entries,
  };
};
