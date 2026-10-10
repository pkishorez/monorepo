import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Input } from '@kstackz/web-platform/components/input';
import { Flights, LOCATIONS } from '../world/index.js';

/*
 * The side panel: a search over the featured places and the list it leaves.
 * Clicking a place asks the map to fly there through Flights, a Request; the
 * panel remembers what it asked for, since it cannot read the map's Model.
 */

const flyTo = (locationId: string) =>
  Effect.gen(function* () {
    yield* (yield* Flights).toPlace(locationId);
  });

export const Places = Actor.make('Places', {
  requires: { flights: Flights },
  model: Schema.Struct({
    query: Schema.String,
    chosenId: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    UpdatedSearchQuery: { value: Schema.String },
    ClickedLocation: { locationId: Schema.String },
  }),
}).build({
  init: () => ({ model: { query: '', chosenId: null } }),
  update: {
    UpdatedSearchQuery: ({ value }, { model }) => ({
      model: { ...model, query: value },
    }),
    ClickedLocation: ({ locationId }, { model }) => ({
      model: { ...model, chosenId: locationId },
      command: flyTo(locationId),
    }),
  },
});

export const PlacesView = View.make(Places, ({ model, send }) => {
  const query = model.query.trim().toLowerCase();
  const shown = LOCATIONS.filter((place) =>
    `${place.name} ${place.region}`.toLowerCase().includes(query),
  );
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <Input
        aria-label="Search places"
        placeholder="Search places…"
        value={model.query}
        onChange={(event) =>
          send({ _tag: 'UpdatedSearchQuery', value: event.target.value })
        }
      />
      <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {shown.map((place) => (
          <li key={place.id}>
            <button
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left hover:bg-muted ${model.chosenId === place.id ? 'bg-muted' : ''}`}
              onClick={() =>
                send({ _tag: 'ClickedLocation', locationId: place.id })
              }
            >
              <span className="block text-sm font-medium">{place.name}</span>
              <span className="block text-xs text-muted-foreground">
                {place.region}
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            No places match “{model.query}”.
          </li>
        )}
      </ul>
    </div>
  );
});
