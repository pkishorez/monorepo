# Old story questions (coverage checklist)

Every question below must be answered by a chapter in the new tree (see `stories-as-one-story.md`, Implementation Decisions → chapter table) or be in the dropped list at the bottom. The old files are readable with `git show HEAD:std-toolkit/stories/<path>`.

## database/dynamodb → Appendix A4

- batch-insert: How is a table filled faster than one write at a time? · What does a batch write leave out?
- consistent-reads: How is a read that is certain to be current requested? · What shape does a native read return?
- going-fully-native: How is something done that the native operations do not offer? · How many levels are there?
- native-updates: How is a counter increased without a read first? · What else can a native update do? · Can a native update refuse to apply?
- table-definition: How does infrastructure code learn the shape of the table? · Why are only five attributes declared?

## database/idb → Appendix A5

- auto-versioned-setup: Who owns the IndexedDB version number? · What happens to existing rows when the shape grows?
- living-in-the-browser: Can the schema upgrade while another tab is open? · What happens when the other tab does not close? · What happens to a tab after another tab upgrades the database?

## database/sqlite → Appendix A6

- four-drivers-one-table: Which runtimes can host the SQLite adapter?
- write-your-own-driver: How much must a custom driver supply? · How does a conditional write reach your driver?

## database/std-table

- access-patterns-and-indexes/secondary-patterns → ch10: A query must return the open notes only. The primary key cannot express that. What can? · How is the same notebook read in a different order?
- access-patterns-and-indexes/sparse-indexes → ch10: Most notes have a due date. Some have none. What happens to those notes in an index that uses the date?
- binding-entities/index-components → A1: What happens when a key part is not a field that encodes to text? · What happens when two access patterns claim the same index slot, or reuse a name?
- binding-entities/sharing-one-table → ch11: A notebook record and a note both use the key value work. Do they collide?
- binding-entities/single-entities → ch12: The notebook has settings. What does a read return before anything is written? · What does a reset do?
- building-the-notebook/a-second-way-to-read → ch09: The notes must come back in title order, not in identity order. The primary key cannot do that. What is added? · How does the notebook group its notes by status?
- building-the-notebook/a-table-to-put-notes-in → ch02: The notebook needs a place to keep notes. What is the least that it must declare? · Why are the two attributes called `pk` and `sk` instead of `notebook` and `noteId`?
- building-the-notebook/the-notebook-we-built → DROPPED
- building-the-notebook/where-a-note-lives → ch03: Two notes are in the notebook called work. One note is in the notebook called home. What does the binding decide? · What orders the notes inside one notebook?
- defining-a-table/reserved-names → A1: Which attribute names can a table not use? · Which index slot names are reserved?
- defining-a-table/topology-limits → A1: What happens when the partition key and the sort key are the same attribute? · What happens when two indexes use the same attribute? · How many index slots can one table declare?
- detecting-and-repairing-drift/backfilling-an-index → ch23: An old row predates a new access pattern. Does it show up as needing repair, and does repairing it leave `_u` and subscribers alone? · The row changes for real before the repair lands. What happens to the repair?
- encoded-and-decoded/codec-fields → ch01: A note carries a reminder date stored as text and read back as a `Date`. Can a field schema do that conversion? · What does work, then?
- evolving-data-in-place/older-rows → ch17: A note was written last year, before the schema had a field. What does a read return today? · What happens after that note is edited and saved?
- evolving-data-in-place/unreadable-rows → ch21: What happens when a stored row does not match the schema? · Does one unreadable row affect the other rows?
- how-these-stories-run/four-adapters → ch24: A Story here says that a note was stored. Where was it stored? · The four databases agree down to the update stamp. How is that possible?
- how-these-stories-run/fresh-databases → A8: Each proof writes notes into a real database. What stops the next proof from finding them? · Does that still happen when a proof fails?
- how-these-stories-run/layer-selection → ch02: A program never names a database. How is one selected, and can it change inside the program?
- how-these-stories-run/the-shared-table → DROPPED
- pagination/page-size → ch08: A notebook holds thousands of notes and the query asked for all of them. How many arrive? · How does the query return a smaller page?
- pagination/resuming-a-query → ch08: A page ends before the partition does. How is the next page read? · What happens at the end of the notebook?
- pagination/tombstones-and-ties → ch08: The notebook holds many deleted notes. Does a page of ten arrive half full? · Can paging miss or repeat a note when two notes sort the same?
- querying/invalid-queries → A1: What happens when a query gives two sort conditions? · What happens with an unknown access pattern, or a limit of zero?
- querying/listing-a-partition → ch07: A notebook holds notes under one partition key. How are all of them read? · How are they read with the newest first? · What does an empty notebook return?
- querying/prefix-matching → ch07: The notes are keyed by a path. How is one folder read without reading the rest? · How does a prefix work when the sort key uses more than one field?
- querying/sort-conditions → ch07: Which sort conditions can a query use, and what does each one return? · Which direction does each condition read in?
- studio-rpc/reading-through-studio → A7: What does Studio need to know before it reads an application table? · What does Studio return for a row written at an old version?
- table-level-enforcement/verify-snapshot → ch22: The very first deploy has nothing to compare against. What happens? · A later deploy changes the table's primary key derivation — a real breaking change. What happens? · A later deploy just adds a new entity — a purely additive, safe change. Does the baseline actually move to include it? · A later deploy edits an index — a real structural change, but one only the index itself needs to catch up on. What happens?
- transactions/atomic-writes → ch13: A note moves between notebooks, which needs two writes. How do they land together? · What happens when one of them is refused? · What does an empty batch do?
- transactions/check-ops → ch14 (Q1–Q5), ch15 (Q6–Q9): A note may go only into a notebook that still exists. How does a batch check a note that it does not write? · How does a batch apply a rule to the note that it does write? · The checked notebook changes between the read and the commit. What happens? · How does a batch assert that a note is there, or is not there? · Does a deleted note still count as being there? · Can a batch write nothing at all? · Can a batch check a note that it also writes? · What do the ops that did not fail report? · How do the notebook settings apply a rule to themselves?
- transactions/refusing-an-update → ch14: A note must not change after it is archived. How is that rule applied at commit time?
- transactions/stale-ops → ch15: The note changed between building the batch and committing it. Is the batch wrong? · How does a rule that was decided earlier still apply? · How does the write go through in any case?
- transactions/transaction-limits → ch13 (empty batch) / A1: A batch touches the same note two times. What happens? · How many notes can one batch touch? · What happens to an op that was built against a different table?
- updating-safely/keys-are-immutable → ch05: An update sets `notebook` to a different value. That field is part of the primary key. What happens?
- updating-safely/partial-updates → ch05: How does an update change the title only, and leave the other fields alone? · How does the new value use the old one?
- updating-safely/skipping-and-missing → ch05: The note already says what the edit would set. How is the write stopped? · What happens when a delete targets a note that is already deleted? · What happens when an update targets a note that is not there?
- watching-for-changes/filtering-by-value → ch16: How does a subscriber hear about only the notes it cares about? · A note matches the filter, then an update moves it away from that filter. Does the subscriber still hear about it?
- watching-for-changes/subscribing-to-a-note → ch16: A note is inserted. Does a subscriber hear about it? · What happens to a write that nobody subscribed to?
- watching-for-changes/table-wide-subscriptions → ch16: What does subscribing to the table itself return?
- writing-and-reading/deleting-and-restoring → ch06: A note is deleted. Is it gone? · How does a query leave the deleted notes out? · How does a deleted note come back?
- writing-and-reading/hard-delete → ch06: A soft delete keeps the row. How is the row removed for real? · How is a whole notebook emptied?
- writing-and-reading/insert-a-row → ch04: A note is inserted. What does the insert return? · The same note is written two times. What happens to the first one? · What does a read return for a note that was never written?

## evolving-schema

- corruption-and-breaking-changes/changing-shipped-migration → ch22: What happens when a migration that has already run is rewritten?
- corruption-and-breaking-changes/editing-shipped-version → ch22: What happens to rows that were written before v1 was edited? · Do rows written after the edit still work?
- corruption-and-breaking-changes/snapshot-guard → ch22: How does the diff describe a correct change? · How does the diff describe an edit to a version that is already approved?
- decoding-scenarios/malformed-payload → A2: What happens when the data does not match the version that it claims? · Does correct data of the same version still decode?
- decoding-scenarios/migration-chain → ch17: The notebook holds notes from each version. Does each note run every step? · What happens to a note that is already at the newest version?
- decoding-scenarios/missing-version-stamp → A2: What happens when data has no `_v`? · What happens when data with no stamp does not match the v1 shape?
- decoding-scenarios/old-row-auto-migrates → ch17: The app knows only the newest Note. How does it read a note from three versions ago? · Does the app learn which version the note came from?
- decoding-scenarios/unknown-version → ch21: What happens when `_v` names a version that the schema does not have?
- defining-evolutions/add-a-field → ch17: A note was written last year. Pinning did not exist then. What does the app see when it reads that note today? · What does the app see when it reads a note that was written after pinning shipped?
- defining-evolutions/no-optional-fields → A2: How does a field that can hold null decode when the value is there? · How does the schema say that a value is absent? · What happens when the key is absent?
- defining-evolutions/remove-a-field → ch18: Each note in storage still has a colour. The schema no longer has one. What does the app see? · What goes into storage when the app saves that note?
- defining-evolutions/rename-a-field → ch18: A note was written when the field was called `body`. Where is that text now?
- defining-evolutions/reserved-underscore → ch01: A note is saved. What is in storage that the app did not put there? · Does the app have to handle that field?
- defining-evolutions/sequential-versions → ch18: The oldest note in the notebook is still at v1. What happens the first time that it is read? · Which version does the Note call its newest? · (third question DROPPED — support.ts identity)
- draft-versions/promoting-a-draft → ch19: A row was written while priority was still just a draft field. What happens to that row once the draft is promoted? · Once promoted, what does a fresh encode write now?
- draft-versions/read-draft-write-latest → ch19: What shape does decode hand back once a draft exists? · What actually gets written when the app encodes a draft value? · Does a Snapshot taken while a draft exists look any different from one taken before it?
- encoding-scenarios/encode-old-shape → ch18: Some old code still builds a note in the v1 shape. Can it save one? · How does that note get saved?
- encoding-scenarios/encode-writes-latest → ch01: A note is encoded for storage. Which version is stamped on it? · The app added an extra field to the note before it saved it. What reaches storage? · What happens when a declared field is absent?
- encoding-scenarios/transformed-fields → ch01: A note stores its word count as text but the app wants a number. Can a field do that conversion? · So how does the note store its word count?
- entity-eschema/entity-id-field → ch17: A note moves through several versions. Is it still the same note? · What happens when that note is written back?
- gotchas-and-best-practices/append-dont-mutate → A3: What happens to the oldest v1 row after two more versions are added? · What happens to a v2 row in the middle? · Do rows from each version reach the same shape?
- gotchas-and-best-practices/make-partial → A3: What does `makePartial` do to a partial update? · What happens when the partial is empty?
- gotchas-and-best-practices/pure-migrations → A3: What happens when the same stored row is decoded two times? · Where does the new value come from?
- gotchas-and-best-practices/total-migrations → A3: What happens to a v1 row that has a real nickname? · What happens to the null nickname that the v1 schema allowed? · What happens to the empty nickname that nobody expected?
- snapshots/round-trip → ch22: What does a captured Note look like on the wire? · Given only that JSON, can something that never saw `Note` decode a real value?
- value-eschema/adopt-existing-schema → ch20: The notebook already had a plain schema for the status of a note. What happens to the data stored under it? · What changes on the next write? · What happens when the schema gets a step later?
- value-eschema/bare-value → ch20: The notebook stored the number of notes per page as the text `"20"`, before versions existed. Can it still be read? · What happens when that value is written back?
- value-eschema/envelope-migrates → ch20: The theme of the notebook was free text. It is now one of two words. How does a stored theme move forward? · What happens when an envelope contains another envelope?
- value-eschema/evolve-a-value → ch20: The notebook stored the status of a note as free text. It now stores one of two words. What happens to the statuses that are already written? · Where does a bare value keep its version stamp?
- value-eschema/value-with-version-key → ch20: A note comes from another service. That service adds its own `_v`. What happens when the note is read? · How is the conflict removed?

## sync

- building-the-simulation/a-backend-and-nobody-watching → ch25: Before any of the sync parts, there is a server that holds notes. What is that server here? · Does a write to it tell anyone?
- building-the-simulation/a-browser-mounts-a-query → ch25: Alice opens the notebook. What must exist before a note on the server can appear on her screen? · (shows/eventuallyShows DROPPED — DSL)
- building-the-simulation/the-vocabulary-we-built → DROPPED
- building-the-simulation/two-browsers-one-backend → ch32: Bob opens the same notebook on his own machine. What do he and Alice share? · Bob loses his connection. What happens to Alice?
- catching-up/a-user-updated-some-time-back → ch28: The backend has history before the browser mounts. Does the browser read it? · Does a note that was deleted long ago stay deleted?
- catching-up/edits-keep-flowing → ch28: How does the browser read a large backlog? · Does a new edit still arrive after the backlog is read?
- leadership/leadership-is-not-a-cache → ch33: Can a late tab with its own in-memory copy miss old data? · Does a shared IndexedDB copy fill a late tab? · Does leadership make peer sync a source of truth?
- leadership/one-reader-many-tabs → ch33: Is leadership automatic? · Do ten matching tabs share one backend reader? · Can two notebooks lead separately? · Can a tab that is waiting still write? · Does closing the leader pass the work on?
- leadership/yielding-leadership → ch33: How does leadership move when a hidden tab must release it? · How does leadership move when only a frozen tab releases it?
- optimistic-transactions/cross-collection → ch31: Do both changes appear before the backend commits? · What happens when the backend transaction fails?
- syncing-on-demand/one-list-at-a-time → ch27: Does mounting a query for one notebook sync that notebook only? · What happens while the live query is not mounted? · Can two notebook queries stay mounted together?
- tests/issue-1 → ch29: What does the first paced update use as its current value? · After the backend changes the same note, what does a second paced update use?
- two-tabs/one-browser-many-tabs → ch32: Alice opens a second tab. What does it show? · Alice adds a note in one tab. Does the other tab see it? · Alice changes a note in one tab. Does the other tab follow? · Alice removes a note in one tab. Does it disappear in the other? · Alice closes a tab. Does the other tab notice?
- two-tabs/peer-sync-model → ch32: Do two tabs with in-memory copies agree at once? · What changes when a tab reads the backend and peer sync is off? · What repairs a peer message that was lost? · Are durable storage and peer freshness connected? · Does turning peer sync off lose agreement?
- wiring-a-collection/from-database-to-collection → ch25 (Q1), ch26 (Q2–Q4): The backend creates a note. What does the browser see? · Can the browser create the note instead? · The browser changes a note. Does the change reach the backend? · The browser removes a note. What remains?

## Dropped

- the-notebook-we-built, the-vocabulary-we-built, the-shared-table, and any question whose only subject is `support.ts` identity or the Simulation DSL (`shows`/`eventuallyShows`). Reason: the import chain makes identity structural; the DSL no longer exists.
