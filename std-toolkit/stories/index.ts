import { Story } from 'laymos/story';

import {
  kindsOfESchema,
  limitationsAndBestPractices,
  whySchemasMustEvolve,
} from './evolving-schema/docs.js';
import { addAField } from './evolving-schema/defining/add-a-field.story.js';
import { removeAField } from './evolving-schema/defining/remove-a-field.story.js';
import { renameAField } from './evolving-schema/defining/rename-a-field.story.js';
import { sequentialVersions } from './evolving-schema/defining/sequential-versions.story.js';
import { noOptionalFields } from './evolving-schema/defining/no-optional-fields.story.js';
import { reservedUnderscore } from './evolving-schema/defining/reserved-underscore.story.js';
import { oldRowAutoMigrates } from './evolving-schema/decoding/old-row-auto-migrates.story.js';
import { migrationChain } from './evolving-schema/decoding/migration-chain.story.js';
import { missingVersionStamp } from './evolving-schema/decoding/missing-version-stamp.story.js';
import { unknownVersion } from './evolving-schema/decoding/unknown-version.story.js';
import { malformedPayload } from './evolving-schema/decoding/malformed-payload.story.js';
import { encodeWritesLatest } from './evolving-schema/encoding/encode-writes-latest.story.js';
import { encodeOldShape } from './evolving-schema/encoding/encode-old-shape.story.js';
import { transformedFields } from './evolving-schema/encoding/transformed-fields.story.js';
import { editingShippedVersion } from './evolving-schema/breaking-changes/editing-shipped-version.story.js';
import { changingShippedMigration } from './evolving-schema/breaking-changes/changing-shipped-migration.story.js';
import { snapshotGuard } from './evolving-schema/breaking-changes/snapshot-guard.story.js';
import { evolveAValue } from './evolving-schema/value/evolve-a-value.story.js';
import { bareValue } from './evolving-schema/value/bare-value.story.js';
import { envelopeMigrates } from './evolving-schema/value/envelope-migrates.story.js';
import { valueWithVersionKey } from './evolving-schema/value/value-with-version-key.story.js';
import { entityIdField } from './evolving-schema/entity/entity-id-field.story.js';
import { appendDontMutate } from './evolving-schema/gotchas/append-dont-mutate.story.js';
import { totalMigrations } from './evolving-schema/gotchas/total-migrations.story.js';
import { pureMigrations } from './evolving-schema/gotchas/pure-migrations.story.js';
import { makePartialValidates } from './evolving-schema/gotchas/make-partial.story.js';

export default Story.group({
  title: 'std-toolkit',
  description: 'Database-agnostic sync over single-table item collections.',
  markdown: `
std-toolkit layers a synchronizable data toolkit over any database that can
store sorted items in a single table. Evolving schemas keep every row readable
as shapes change; snapshots guard the contracts; sync moves changes between
peers.
`,
  children: [
    Story.group({
      title: 'Evolving Schema',
      description:
        'Schemas that keep every version and migrate old data forward on read.',
      markdown: `
Data outlives code. An evolving schema (ESchema) records every version of a
shape plus a migration between each pair, so any row ever written decodes to
the latest shape — no table rewrites, no defensive reads.

Start with the two doc pages for the intuition, then walk the sections: they
are ordered the way you will meet the ideas in practice — declaring
evolutions, reading, writing, breaking things, and the value/entity variants.
`,
      children: [
        whySchemasMustEvolve,
        kindsOfESchema,
        Story.group({
          title: 'Defining evolutions',
          description:
            'How a schema grows: deltas, migrations, and the rules the builder enforces.',
          markdown: `
Every change to a shape is an appended \`evolve(version, delta, migration)\`
step. The delta says what happened to the shape; the migration says what
happens to the data. The builder enforces the rest at compile time — versions
in sequence, no optionals, no underscore keys, and (for entities) hands off
the id.

These stories declare one evolution each and prove what it does to real rows.
`,
          children: [
            addAField,
            removeAField,
            renameAField,
            sequentialVersions,
            noOptionalFields,
            reservedUnderscore,
          ],
        }),
        Story.group({
          title: 'Decoding scenarios',
          description:
            'Decode is where migration actually happens — and where bad data is stopped.',
          markdown: `
All the time travel lives in \`decode\`: read the \`_v\` stamp, validate the
payload against *that* version, then fold it forward through every later
migration. These stories walk the dispatch table — old rows, ancient rows,
unstamped rows, impostor versions, and corrupt payloads.
`,
          children: [
            oldRowAutoMigrates,
            migrationChain,
            missingVersionStamp,
            unknownVersion,
            malformedPayload,
          ],
        }),
        Story.group({
          title: 'Encoding scenarios',
          description:
            'Encode never time-travels: latest shape in, stamped row out.',
          markdown: `
Where decode understands every version, encode speaks exactly one language:
the latest. It validates against the newest schema, runs field codecs toward
storage, and stamps \`_v\`. No migration ever runs on the write path — these
stories show why that asymmetry is the safe design.
`,
          children: [encodeWritesLatest, encodeOldShape, transformedFields],
        }),
        Story.group({
          title: 'Corruption & breaking changes',
          description:
            'How evolving schemas break — and the snapshot that catches it in review.',
          markdown: `
An evolving schema's one hard rule is that history is immutable: shipped
versions and shipped migrations are contracts with the rows already written.
Nothing at runtime enforces it. These stories demonstrate exactly how each
violation corrupts reads — and how snapshot diffs catch the mistake before it
ships.
`,
          children: [
            editingShippedVersion,
            changingShippedMigration,
            snapshotGuard,
          ],
        }),
        Story.group({
          title: 'Value ESchema',
          description:
            'Versioning a single value: envelopes, whole-codec evolution, and the _v collision.',
          markdown: `
A \`ValueESchema\` versions a lone value — scalar, enum, union — with no
struct around it. Each evolution replaces the entire codec, and storage wraps
the value in a \`{ _v, value }\` envelope to carry the stamp. That envelope is
also where this variant's one ambiguity lives.
`,
          children: [
            evolveAValue,
            bareValue,
            envelopeMigrates,
            valueWithVersionKey,
          ],
        }),
        Story.group({
          title: 'Entity ESchema',
          description:
            'A struct schema plus a reserved identity that survives every version.',
          markdown: `
\`EntityESchema\` is the struct story with one addition: a declared id field,
auto-injected into every version and untouchable by any delta. Everything
else — evolutions, decode, encode — behaves exactly as in the sections above.
`,
          children: [entityIdField],
        }),
        Story.group({
          title: 'Gotchas & best practices',
          description:
            'The habits that keep read-time migration safe, each proven on real rows.',
          markdown: `
Read-time migration trades deploy-time ceremony for a small set of
discipline rules. The doc page collects the limitations; each story here
takes one rule and shows — with running code — what it protects you from.
`,
          children: [
            limitationsAndBestPractices,
            appendDontMutate,
            totalMigrations,
            pureMigrations,
            makePartialValidates,
          ],
        }),
      ],
    }),
  ],
});
