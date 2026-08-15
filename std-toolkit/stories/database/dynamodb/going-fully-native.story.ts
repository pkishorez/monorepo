import { Effect } from 'effect';
import { dynamoTableService } from 'std-toolkit/db/dynamodb';
import { Story } from 'laymos/story';

import { note, onDynamoDB } from '../support.js';
import { unmarshallItem } from './support.js';

export const goingFullyNative = Story.make({
  title: 'Going fully native',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when even the native operations are not enough?',
      {
        answer:
          'The escape hatch has a bottom rung: the DynamoTableService exposes the raw typed client plus the physical table name, and with marshall/unmarshall you can speak the entire DynamoDB API. Here a Scan — an operation the StdTable surface deliberately never offers — walks the physical table the portable inserts produced. Each rung down trades portability away: this program can never run on IndexedDB or SQLite.',
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
    Story.question('Where does the ladder start and end?', {
      answer:
        'Three rungs. The StdTable surface runs unchanged on every adapter; DynamoDB.update, batchInsert, and getItem keep typed entities but require DynamoDB; the DynamoTableService drops to the wire protocol. The same Effect layer provides all three at once, so a program mixes rungs freely — and its requirements record exactly how far down it reached.',
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
