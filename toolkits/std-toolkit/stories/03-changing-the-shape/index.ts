import { Story } from 'laymos/story';
import { addingAFieldToTasksThatAlreadyExist } from './17-adding-a-field-to-tasks-that-already-exist/adding-a-field-to-tasks-that-already-exist.story.js';
import { removingAndRenamingFields } from './18-removing-and-renaming-fields/removing-and-renaming-fields.story.js';
import { changingTheShapeWhileYouAreStillDeciding } from './19-changing-the-shape-while-you-are-still-deciding/changing-the-shape-while-you-are-still-deciding.story.js';
import { whenASettingsShapeChanges } from './20-when-a-settings-shape-changes/when-a-settings-shape-changes.story.js';
import { aRowTheSchemaCantRead } from './21-a-row-the-schema-cant-read/a-row-the-schema-cant-read.story.js';
import { promisingNeverToBreakAnOldTask } from './22-promising-never-to-break-an-old-task/promising-never-to-break-an-old-task.story.js';
import { anOldTaskMeetsANewIndex } from './23-an-old-task-meets-a-new-index/an-old-task-meets-a-new-index.story.js';

// Act III: chapters 17–23, in reading order.
export const actThree = Story.group(
  'Changing the shape after you shipped',
  {
    description:
      'Add, remove and rename fields on tasks that already exist, try the next version in memory before it ships, cope with unreadable rows, and keep the promise never to break an old row.',
  },
  [
    addingAFieldToTasksThatAlreadyExist,
    removingAndRenamingFields,
    changingTheShapeWhileYouAreStillDeciding,
    whenASettingsShapeChanges,
    aRowTheSchemaCantRead,
    promisingNeverToBreakAnOldTask,
    anOldTaskMeetsANewIndex,
  ],
);
