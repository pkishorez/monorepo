import { Story } from 'laymos/story';

import { addAField } from './evolving-schema/defining-evolutions/add-a-field.story.js';
import { removeAField } from './evolving-schema/defining-evolutions/remove-a-field.story.js';
import { renameAField } from './evolving-schema/defining-evolutions/rename-a-field.story.js';
import { sequentialVersions } from './evolving-schema/defining-evolutions/sequential-versions.story.js';
import { noOptionalFields } from './evolving-schema/defining-evolutions/no-optional-fields.story.js';
import { reservedUnderscore } from './evolving-schema/defining-evolutions/reserved-underscore.story.js';
import { oldRowAutoMigrates } from './evolving-schema/decoding-scenarios/old-row-auto-migrates.story.js';
import { migrationChain } from './evolving-schema/decoding-scenarios/migration-chain.story.js';
import { missingVersionStamp } from './evolving-schema/decoding-scenarios/missing-version-stamp.story.js';
import { unknownVersion } from './evolving-schema/decoding-scenarios/unknown-version.story.js';
import { malformedPayload } from './evolving-schema/decoding-scenarios/malformed-payload.story.js';
import { encodeWritesLatest } from './evolving-schema/encoding-scenarios/encode-writes-latest.story.js';
import { encodeOldShape } from './evolving-schema/encoding-scenarios/encode-old-shape.story.js';
import { transformedFields } from './evolving-schema/encoding-scenarios/transformed-fields.story.js';
import { editingShippedVersion } from './evolving-schema/corruption-and-breaking-changes/editing-shipped-version.story.js';
import { changingShippedMigration } from './evolving-schema/corruption-and-breaking-changes/changing-shipped-migration.story.js';
import { snapshotGuard } from './evolving-schema/corruption-and-breaking-changes/snapshot-guard.story.js';
import { evolveAValue } from './evolving-schema/value-eschema/evolve-a-value.story.js';
import { adoptExistingSchema } from './evolving-schema/value-eschema/adopt-existing-schema.story.js';
import { bareValue } from './evolving-schema/value-eschema/bare-value.story.js';
import { envelopeMigrates } from './evolving-schema/value-eschema/envelope-migrates.story.js';
import { valueWithVersionKey } from './evolving-schema/value-eschema/value-with-version-key.story.js';
import { entityIdField } from './evolving-schema/entity-eschema/entity-id-field.story.js';
import { appendDontMutate } from './evolving-schema/gotchas-and-best-practices/append-dont-mutate.story.js';
import { totalMigrations } from './evolving-schema/gotchas-and-best-practices/total-migrations.story.js';
import { pureMigrations } from './evolving-schema/gotchas-and-best-practices/pure-migrations.story.js';
import { makePartialValidates } from './evolving-schema/gotchas-and-best-practices/make-partial.story.js';

export default Story.group('std-toolkit', [
  Story.group('Evolving Schema', [
    Story.group('Defining evolutions', [
      addAField,
      removeAField,
      renameAField,
      sequentialVersions,
      noOptionalFields,
      reservedUnderscore,
    ]),
    Story.group('Decoding scenarios', [
      oldRowAutoMigrates,
      migrationChain,
      missingVersionStamp,
      unknownVersion,
      malformedPayload,
    ]),
    Story.group('Encoding scenarios', [
      encodeWritesLatest,
      encodeOldShape,
      transformedFields,
    ]),
    Story.group('Corruption & breaking changes', [
      editingShippedVersion,
      changingShippedMigration,
      snapshotGuard,
    ]),
    Story.group('Value ESchema', [
      evolveAValue,
      adoptExistingSchema,
      bareValue,
      envelopeMigrates,
      valueWithVersionKey,
    ]),
    Story.group('Entity ESchema', [entityIdField]),
    Story.group('Gotchas & best practices', [
      appendDontMutate,
      totalMigrations,
      pureMigrations,
      makePartialValidates,
    ]),
  ]),
]);
