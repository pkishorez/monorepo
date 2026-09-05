import { Story } from 'laymos/story';
import { swappingMemoryForSqliteIndexeddbDynamodb } from './24-swapping-memory-for-sqlite-indexeddb-dynamodb/swapping-memory-for-sqlite-indexeddb-dynamodb.story.js';

// Act IV: chapter 24. The one chapter that runs on more than one database.
export const actFour = Story.group(
  'The same code on other databases',
  {
    description:
      'Run the board unchanged on SQLite, IndexedDB and DynamoDB by swapping one line.',
  },
  [swappingMemoryForSqliteIndexeddbDynamodb],
);
