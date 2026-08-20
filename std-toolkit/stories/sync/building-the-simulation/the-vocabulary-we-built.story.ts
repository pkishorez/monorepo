import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { Simulation } from '../support.js';

const storyTable = StdTable.make('sync-stories').primary('pk', 'sk').build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  pinned: Schema.Boolean,
}).build();

const noteEntity = storyTable
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .build();

import {
  Simulation as sharedSimulation,
  noteEntity as sharedNoteEntity,
  storyTable as sharedTable,
} from '../support.js';

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export const theVocabularyWeBuilt = Story.make({
  title: 'The vocabulary we built',
  description:
    'Step four. This Story proves that the table, the Note, and the words used here are the ones that the other Stories use.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The Stories after this one import their table and Note from `support.ts`. Is it the same pair?',
      {
        answer:
          'Yes, and this question proves it. The table built above has the same name and the same key attributes as the one in `support.ts`. The Note bound to it uses the same keys.',
        proof: Effect.gen(function* () {
          yield* Story.assert(
            'both tables are the same table',
            storyTable.logicalName === sharedTable.logicalName &&
              same(storyTable.primary, sharedTable.primary),
          );
          yield* Story.assert(
            'both bind the same entity, keyed the same way',
            noteEntity.name === sharedNoteEntity.name &&
              same(noteEntity.primary, sharedNoteEntity.primary),
          );
          return {
            table: storyTable.logicalName,
            entity: noteEntity.name,
            primary: noteEntity.primary,
          };
        }),
      },
    ),
    Story.question('Is there more of the simulator to learn?', {
      answer:
        'Not to read these Stories. `Simulation` is the whole interface. It gives you a backend, browsers, tabs, mounting and unmounting a live query, connecting and disconnecting, and the two assertions. The simulator is in `stories/sync/simulation/`, and these Stories assume that you will not open it.',
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'the Stories here and the Stories after use one door',
          Simulation === sharedSimulation,
        );
        yield* Story.assert(
          'and it is the door the support file exports',
          typeof sharedSimulation.make === 'function' &&
            typeof sharedSimulation.collection === 'function',
        );
        return { door: Object.keys(sharedSimulation) };
      }),
    }),
  ],
});
