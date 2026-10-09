import { Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Link, Location, heardUrl, pushUrl } from '../../location/index.js';
import { paths, searchOn } from '../route/index.js';
import { Person, findPerson, remember, search } from './staff.js';

/*
 * The People page: a search kept in the URL (`#/people?q=dev`), its recent
 * searches, and the results after a fake 300 ms lookup.
 *
 * It is a Child of the root's People State, so it exists only while that
 * page shows. It cannot be handed the search when it is made (`init` takes
 * nothing), so it listens to the URL itself: the search arrives as
 * `HeardSearch` right after it is created, and again whenever the query
 * changes while the page stays. Submitting pushes a new URL, and so does a
 * click on a person: the URL is a Service any Node can move, and the root
 * hears it like any other change.
 */

const LOOKUP_MS = 300;

const Results = Schema.TaggedUnion({
  Loading: {},
  Loaded: { query: Schema.String, people: Schema.Array(Person) },
});
type Results = typeof Results.Type;

export const People = Node.make('People', {
  requires: { location: Location },
  model: Schema.Struct({
    input: Schema.String,
    history: Schema.Array(Schema.String),
    results: Results,
  }),
  message: Schema.TaggedUnion({
    HeardSearch: { text: Schema.String },
    EditedInput: { value: Schema.String },
    SubmittedSearch: {},
    ClickedLink: { path: Schema.String },
    FoundPeople: { query: Schema.String, people: Schema.Array(Person) },
  }),
}).build({
  init: () => ({
    model: { input: '', history: [], results: { _tag: 'Loading' } },
  }),
  lifetime: () =>
    heardUrl(null).pipe(
      Stream.map(({ path }) => searchOn(path)),
      Stream.filter((text): text is string => text !== null),
      Stream.changes,
      Stream.map((text) => ({ _tag: 'HeardSearch' as const, text })),
    ),
  update: {
    HeardSearch: ({ text }, { model }) => ({
      model: {
        input: text,
        history: remember(model.history, text),
        results: { _tag: 'Loading' },
      },
      commands: [lookUp(text)],
      replaceCommands: true,
    }),
    EditedInput: ({ value }, { model }) => ({
      model: { ...model, input: value },
    }),
    SubmittedSearch: (_, { model }) => ({
      commands: [pushUrl(paths.people(model.input.trim()))],
    }),
    ClickedLink: ({ path }) => ({ commands: [pushUrl(path)] }),
    FoundPeople: ({ query, people }, { model }) => ({
      model: { ...model, results: { _tag: 'Loaded', query, people } },
    }),
  },
});

const lookUp = (text: string) =>
  Effect.sleep(LOOKUP_MS).pipe(
    Effect.as({
      _tag: 'FoundPeople' as const,
      query: text,
      people: search(text),
    }),
  );

const statusOf = (results: Results) => {
  if (results._tag === 'Loading') return 'Searching…';
  if (results.query === '') return 'Click on any person to view their details:';
  const count = results.people.length;
  return `${count} ${count === 1 ? 'result' : 'results'} for “${results.query}”`;
};

export const PeopleView = View.make(People, ({ model, send }) => (
  <section className="flex flex-col gap-6">
    <h1 className="text-3xl font-semibold">People</h1>
    <form
      role="search"
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send({ _tag: 'SubmittedSearch' });
      }}
    >
      <Input
        type="search"
        aria-label="Search people"
        placeholder="Search by name or role…"
        autoComplete="off"
        value={model.input}
        onChange={(event) =>
          send({ _tag: 'EditedInput', value: event.target.value })
        }
      />
      <Button type="submit">Search</Button>
    </form>
    {model.history.length > 0 && (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium">Recent searches:</span>
        {model.history.map((term) => (
          <span
            key={term}
            className="rounded bg-muted px-2 py-0.5 font-mono text-foreground"
          >
            {term}
          </span>
        ))}
      </div>
    )}
    <p aria-live="polite" className="text-muted-foreground">
      {statusOf(model.results)}
    </p>
    {model.results._tag === 'Loaded' && (
      <ul className="flex flex-col gap-2">
        {model.results.people.map((person) => (
          <li key={person.id}>
            <Link
              to={paths.person(person.id)}
              onNavigate={(path) => send({ _tag: 'ClickedLink', path })}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted"
            >
              <span className="font-semibold">{person.name}</span>
              <span className="text-muted-foreground">{person.role}</span>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </section>
));

/** The page for one person, drawn from the root's Person State. */
export const PersonPage = ({
  personId,
  onNavigate,
}: {
  readonly personId: number;
  readonly onNavigate: (path: string) => void;
}) => {
  const person = findPerson(personId);
  const back = (
    <Link
      to={paths.people()}
      onNavigate={onNavigate}
      className="text-primary hover:underline"
    >
      ← Back to People
    </Link>
  );
  if (!person)
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-destructive">
          Person Not Found
        </h1>
        <p className="text-muted-foreground">
          No person found with ID {personId}.
        </p>
        {back}
      </section>
    );
  return (
    <section className="flex flex-col gap-4">
      {back}
      <h1 className="text-3xl font-semibold">{person.name}</h1>
      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-6">
        <div>
          <dt className="text-xs text-muted-foreground uppercase">ID</dt>
          <dd className="text-lg">{person.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground uppercase">Role</dt>
          <dd className="text-lg">{person.role}</dd>
        </div>
      </dl>
    </section>
  );
};
