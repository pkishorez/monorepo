import { Story } from 'laymos/story';
import { definingTheShapeOfATask } from './01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { makingATableForTasksToLiveIn } from './02-making-a-table-for-tasks-to-live-in/making-a-table-for-tasks-to-live-in.story.js';
import { tellingTheTableWhereEachTaskGoes } from './03-telling-the-table-where-each-task-goes/telling-the-table-where-each-task-goes.story.js';
import { savingATaskAndReadingItBack } from './04-saving-a-task-and-reading-it-back/saving-a-task-and-reading-it-back.story.js';
import { changingPartOfATask } from './05-changing-part-of-a-task/changing-part-of-a-task.story.js';
import { removingATaskAndGettingItBack } from './06-removing-a-task-and-getting-it-back/removing-a-task-and-getting-it-back.story.js';
import { listingTheTasksOnOneBoard } from './07-listing-the-tasks-on-one-board/listing-the-tasks-on-one-board.story.js';
import { readingALongListOnePageAtATime } from './08-reading-a-long-list-one-page-at-a-time/reading-a-long-list-one-page-at-a-time.story.js';

// Act I: chapters 01–08, in reading order.
export const actOne = Story.group(
  'One task, one table',
  {
    description:
      'Define what a task is, give it a table to live in, and save, change, remove, list and page through tasks.',
  },
  [
    definingTheShapeOfATask,
    makingATableForTasksToLiveIn,
    tellingTheTableWhereEachTaskGoes,
    savingATaskAndReadingItBack,
    changingPartOfATask,
    removingATaskAndGettingItBack,
    listingTheTasksOnOneBoard,
    readingALongListOnePageAtATime,
  ],
);
