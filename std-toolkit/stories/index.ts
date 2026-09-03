import { Story } from 'laymos/story';

import { actOne } from './01-one-task-one-table/index.js';
import { actTwo } from './02-more-ways-in/index.js';
import { actThree } from './03-changing-the-shape/index.js';
import { actFour } from './04-other-databases/index.js';
import { actFive } from './05-in-the-browser/index.js';
import { appendix } from './99-appendix/index.js';

// One story, read top to bottom: a task board built in five acts, then an appendix.
export default Story.group(
  'std-toolkit',
  {
    description:
      'A task board built step by step: one table, more ways in, changing shape after shipping, other databases, and the browser.',
  },
  [actOne, actTwo, actThree, actFour, actFive, appendix],
);
