import { Schema } from 'effect';

/* The people the People page searches, by name or role. */

export const Person = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  role: Schema.String,
});
export type Person = typeof Person.Type;

const STAFF: ReadonlyArray<Person> = [
  { id: 1, name: 'Alice Johnson', role: 'Designer' },
  { id: 2, name: 'Bob Smith', role: 'Developer' },
  { id: 3, name: 'Carol Davis', role: 'Manager' },
  { id: 4, name: 'David Wilson', role: 'Developer' },
  { id: 5, name: 'Eva Brown', role: 'Designer' },
];

export const search = (text: string): ReadonlyArray<Person> => {
  const query = text.trim().toLowerCase();
  return query === ''
    ? STAFF
    : STAFF.filter(
        (person) =>
          person.name.toLowerCase().includes(query) ||
          person.role.toLowerCase().includes(query),
      );
};

export const findPerson = (id: number) =>
  STAFF.find((person) => person.id === id);

const HISTORY_LIMIT = 5;

/** The newest search first, without repeats, five at most. */
export const remember = (history: ReadonlyArray<string>, text: string) =>
  text === ''
    ? history
    : [text, ...history.filter((each) => each !== text)].slice(
        0,
        HISTORY_LIMIT,
      );
