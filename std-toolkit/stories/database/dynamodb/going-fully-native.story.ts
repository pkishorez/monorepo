import { Effect } from 'effect';
import { dynamoTableService } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { note, onDynamoDB } from '../support.js';
import { unmarshallItem } from './support.js';

export const goingFullyNative = Story.make({
  title: 'Going fully native',
  description: 'The raw client, and the portability that it costs.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How is something done that the native operations do not offer?',
      {
        answer:
          'Use the raw client. The adapter exposes the typed client and the physical table name. With them you can use the whole DynamoDB API. This Story runs a scan, which the portable surface does not offer, over the rows that the portable writes produced.',
        proof: Effect.gen(function* () {
          const result = yield* onDynamoDB(
            Effect.gen(function* () {
              yield* Effect.forEach(['n1', 'n2', 'n3'], (noteId) =>
                note.insert({
                  noteId,
                  notebook: 'ladder',
                  title: `Note ${noteId}`,
                  status: 'open',
                }),
              );
              const service = yield* dynamoTableService('std-table-stories');
              const scanned = yield* service.client.scan({
                TableName: service.tableName,
              });
              const rows = (scanned.Items ?? []).map((item) =>
                unmarshallItem(item),
              );
              return {
                scannedCount: scanned.Count ?? 0,
                entities: rows.map((row) => row._e).sort(),
              };
            }),
          );
          yield* Story.assert(
            'the raw scan sees every physical row the portable surface wrote',
            result.scannedCount === 3,
          );
          yield* Story.assert(
            'the rows carry the physical entity discriminator',
            result.entities.every((entity) => entity === 'Note'),
          );
          return result;
        }),
      },
    ),
    Story.question('How many levels are there?', {
      answer:
        'Three. The portable surface runs on each adapter. The native operations keep typed entities but need DynamoDB. The raw client drops to the wire protocol. Each level down trades portability away, and code at the last level cannot run on IndexedDB or SQLite.',
      proof: Effect.gen(function* () {
        const result = yield* onDynamoDB(
          Effect.gen(function* () {
            const portable = yield* note.insert({
              noteId: 'n1',
              notebook: 'ladder',
              title: 'Portable',
              status: 'open',
            });
            const service = yield* dynamoTableService('std-table-stories');
            const described = yield* service.client.describeTable({
              TableName: service.tableName,
            });
            return {
              portableWrite: portable.value.noteId,
              nativeTableStatus: described.Table?.TableStatus ?? 'unknown',
            };
          }),
        );
        yield* Story.assert(
          'one program used the top and bottom rungs together',
          result.portableWrite === 'n1' &&
            result.nativeTableStatus === 'ACTIVE',
        );
        return result;
      }),
    }),
  ],
});
