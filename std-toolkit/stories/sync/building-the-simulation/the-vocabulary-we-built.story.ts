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
    'Step four: proof that the table, the Note, and the words used here are the ones every later Story imports.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'From here on the Stories import their table and Note from `support.ts` rather than declaring them. Is it the same pair?',
      {
        answer:
          'Yes, and this proves it rather than promising it. The table assembled above has the same name and key attributes as the shared one, and the Note bound to it is keyed identically.',
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
    Story.question('And the simulator itself — is there more of it to learn?', {
      answer:
        'Not for reading these Stories. `Simulation` is the whole door: a Backend, browsers, tabs, mounting and unmounting Live Queries, connecting and disconnecting, and the two assertions. The simulator behind it lives in `stories/sync/simulation/` and these Stories are written on the assumption you will not open it.',
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
