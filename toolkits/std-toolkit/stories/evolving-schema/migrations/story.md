# Migrations

Every change you make to a shape upgrades old rows as they are read, so you never rewrite your data up front.

You change a shape and ship. Your database still holds rows from every earlier release, some saved yesterday, some years ago, and you don't want a script that rewrites them all first.

You write each step as a plain function from the previous version's value to the next. When an old row is read, every step since its version runs in order: [a task saved at version 1 reads as version 3](std-toolkit/evolving-schema/migrations/a-v1-task-reads-at-v3-without-touching-storage), with [the new field filled in](std-toolkit/evolving-schema/migrations/an-old-task-gets-the-new-field) and [a renamed field keeping its value](std-toolkit/evolving-schema/migrations/a-renamed-field-keeps-its-value). [A board of mixed versions lists in one shape](std-toolkit/evolving-schema/migrations/a-board-of-mixed-versions-lists-in-one-shape), and [a real SQLite database behaves the same](std-toolkit/evolving-schema/migrations/an-old-row-in-sqlite-reads-in-the-new-shape). The stored row stays as it was until [the next save stores it at the latest version](std-toolkit/evolving-schema/migrations/the-next-save-upgrades-an-old-task).

When something is wrong you hear about it instead of getting a guess: [a migration that throws fails the read](std-toolkit/evolving-schema/migrations/a-failing-migration-fails-the-read), [a row that breaks its version fails loudly](std-toolkit/evolving-schema/migrations/a-row-that-breaks-its-version-fails-loudly), and [an older release knows a row is too new](std-toolkit/evolving-schema/migrations/an-old-release-knows-a-row-is-too-new).

Adding an index? Old rows have no keys for it yet. A reindex [puts them into the new index](std-toolkit/evolving-schema/migrations/reindexing-puts-old-rows-into-a-new-index) and [never overwrites a newer write](std-toolkit/evolving-schema/migrations/a-reindex-never-overwrites-a-newer-write).
