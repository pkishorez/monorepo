import { Story } from 'laymos/story';
import { attributeAndSlotNamesYouCannotUse } from './a1-names-and-shapes-a-table-refuses/attribute-and-slot-names-you-cannot-use.story.js';
import { batchesThatAreRefused } from './a1-names-and-shapes-a-table-refuses/batches-that-are-refused.story.js';
import { keyPartsAndIndexSlotsThatDoNotFit } from './a1-names-and-shapes-a-table-refuses/key-parts-and-index-slots-that-do-not-fit.story.js';
import { queriesThatAreRefused } from './a1-names-and-shapes-a-table-refuses/queries-that-are-refused.story.js';
import { tableShapesThatAreRefused } from './a1-names-and-shapes-a-table-refuses/table-shapes-that-are-refused.story.js';
import { dataThatDoesNotMatchItsVersion } from './a2-shapes-a-schema-refuses/data-that-does-not-match-its-version.story.js';
import { dataWithNoVersionStamp } from './a2-shapes-a-schema-refuses/data-with-no-version-stamp.story.js';
import { sayingAValueIsAbsent } from './a2-shapes-a-schema-refuses/saying-a-value-is-absent.story.js';
import { aMigrationMustNotLookAround } from './a3-habits-for-migrations/a-migration-must-not-look-around.story.js';
import { appendAVersionNeverEditOne } from './a3-habits-for-migrations/append-a-version-never-edit-one.story.js';
import { checkingAPartialUpdate } from './a3-habits-for-migrations/checking-a-partial-update.story.js';
import { everyOldValueMustMapSomewhere } from './a3-habits-for-migrations/every-old-value-must-map-somewhere.story.js';
import { changingANumberWithoutReadingItFirst } from './a4-dynamodb-only/changing-a-number-without-reading-it-first.story.js';
import { fillingATableInBatches } from './a4-dynamodb-only/filling-a-table-in-batches.story.js';
import { goingFullyNative } from './a4-dynamodb-only/going-fully-native.story.js';
import { readingWhatWasJustWritten } from './a4-dynamodb-only/reading-what-was-just-written.story.js';
import { tellingInfrastructureTheTablesShape } from './a4-dynamodb-only/telling-infrastructure-the-tables-shape.story.js';
import { upgradingWhileAnotherTabIsOpen } from './a5-indexeddb-in-a-real-browser/upgrading-while-another-tab-is-open.story.js';
import { whoOwnsTheVersionNumber } from './a5-indexeddb-in-a-real-browser/who-owns-the-version-number.story.js';
import { oneTableFourRuntimes } from './a6-sqlite-drivers-and-writing-your-own/one-table-four-runtimes.story.js';
import { writingYourOwnDriver } from './a6-sqlite-drivers-and-writing-your-own/writing-your-own-driver.story.js';
import { whatStudioNeedsAndWhatItReturns } from './a7-reading-a-table-from-studio/what-studio-needs-and-what-it-returns.story.js';
import { aFreshDatabaseForEveryProof } from './a8-how-these-chapters-run/a-fresh-database-for-every-proof.story.js';

// Appendix: eight non-spine groups for rules, limits, habits and one-database features.
export const appendix = Story.group(
  'Appendix',
  {
    description:
      'The rules and limits behind the chapters, habits worth keeping, features that belong to one database, and how the chapters themselves run.',
  },
  [
    Story.group(
      'Names and shapes a table refuses',
      {
        description:
          'What a table turns away while it is still being declared, queried or written to in a batch.',
      },
      [
        attributeAndSlotNamesYouCannotUse,
        tableShapesThatAreRefused,
        keyPartsAndIndexSlotsThatDoNotFit,
        queriesThatAreRefused,
        batchesThatAreRefused,
      ],
    ),
    Story.group(
      'Shapes a schema refuses',
      {
        description:
          'Absent values, rows with no version stamp, and rows that do not match the version they claim.',
      },
      [
        sayingAValueIsAbsent,
        dataWithNoVersionStamp,
        dataThatDoesNotMatchItsVersion,
      ],
    ),
    Story.group(
      'Habits for migrations',
      {
        description:
          'The habits that keep a shape safe to change after it has shipped.',
      },
      [
        appendAVersionNeverEditOne,
        everyOldValueMustMapSomewhere,
        aMigrationMustNotLookAround,
        checkingAPartialUpdate,
      ],
    ),
    Story.group(
      'DynamoDB only',
      {
        description:
          'Batch writes, in-place arithmetic, consistent reads, a create-table input and the raw client.',
      },
      [
        fillingATableInBatches,
        changingANumberWithoutReadingItFirst,
        readingWhatWasJustWritten,
        tellingInfrastructureTheTablesShape,
        goingFullyNative,
      ],
    ),
    Story.group(
      'IndexedDB in a real browser',
      {
        description:
          'Who moves the version number, and how an upgrade gets past another open tab.',
      },
      [whoOwnsTheVersionNumber, upgradingWhileAnotherTabIsOpen],
    ),
    Story.group(
      'SQLite drivers, and writing your own',
      {
        description:
          'One table over several SQLite runtimes, and the three-method driver that makes it possible.',
      },
      [oneTableFourRuntimes, writingYourOwnDriver],
    ),
    Story.group(
      'Reading a table from Studio',
      {
        description:
          'The one read-only RPC group that lets Studio discover and read a table.',
      },
      [whatStudioNeedsAndWhatItReturns],
    ),
    Story.group(
      'How these chapters run',
      {
        description:
          'The one shared helper behind every proof, and what it promises.',
      },
      [aFreshDatabaseForEveryProof],
    ),
  ],
);
