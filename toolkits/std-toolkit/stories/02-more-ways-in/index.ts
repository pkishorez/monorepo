import { Story } from 'laymos/story';
import { listingTasksInADifferentOrder } from './09-listing-tasks-in-a-different-order/listing-tasks-in-a-different-order.story.js';
import { findingOnePersonsTasksAcrossEveryBoard } from './10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import { keepingBoardsAndTasksInTheSameTable } from './11-keeping-boards-and-tasks-in-the-same-table/keeping-boards-and-tasks-in-the-same-table.story.js';
import { oneRecordThatExistsExactlyOnce } from './12-one-record-that-exists-exactly-once/one-record-that-exists-exactly-once.story.js';
import { twoWritesThatMustLandTogether } from './13-two-writes-that-must-land-together/two-writes-that-must-land-together.story.js';
import { writingOnlyIfSomethingIsStillTrue } from './14-writing-only-if-something-is-still-true/writing-only-if-something-is-still-true.story.js';
import { whenTheTaskChangedUnderYou } from './15-when-the-task-changed-under-you/when-the-task-changed-under-you.story.js';
import { beingToldWhenATaskChanges } from './16-being-told-when-a-task-changes/being-told-when-a-task-changes.story.js';

// Act II: chapters 09–16, in reading order.
export const actTwo = Story.group(
  'More ways in, more than one thing at a time',
  {
    description:
      'Read tasks in other orders, keep boards and settings beside them, write several things at once, and hear about changes.',
  },
  [
    listingTasksInADifferentOrder,
    findingOnePersonsTasksAcrossEveryBoard,
    keepingBoardsAndTasksInTheSameTable,
    oneRecordThatExistsExactlyOnce,
    twoWritesThatMustLandTogether,
    writingOnlyIfSomethingIsStillTrue,
    whenTheTaskChangedUnderYou,
    beingToldWhenATaskChanges,
  ],
);
