# Keyed entities

Save many things of one kind and find each by its key, by an index, or page by page.

A board holds hundreds of tasks. You add them, change a few fields, delete some, and list them in different orders on different screens.

A keyed entity gives you insert, get, update, delete, and query. [A saved task reads back exactly as saved](std-toolkit/entities/keyed/a-saved-task-reads-back-as-saved), and [inserting it twice keeps the first](std-toolkit/entities/keyed/inserting-twice-keeps-the-first). [An update changes only the fields it names](std-toolkit/entities/keyed/an-update-changes-only-what-it-names), [never the key](std-toolkit/entities/keyed/a-task-cannot-move-to-another-key), and [a check you attach can refuse it](std-toolkit/entities/keyed/a-refused-check-leaves-the-task-alone) without writing anything.

Deleting leaves a tombstone so other devices hear about it, and [a deleted task can be restored](std-toolkit/entities/keyed/a-deleted-task-can-be-restored). When you really mean it, [a hard delete is for good](std-toolkit/entities/keyed/a-hard-delete-is-for-good).

Indexes let [a board list its tasks by title while each person finds their own](std-toolkit/entities/keyed/tasks-are-found-by-title-and-by-assignee). A long board [pages through every task exactly once](std-toolkit/entities/keyed/paging-sees-every-task-once), and [subscribers hear every saved change](std-toolkit/entities/keyed/subscribers-hear-every-saved-change).
