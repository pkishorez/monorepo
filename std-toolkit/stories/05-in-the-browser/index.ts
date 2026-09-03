import { Story } from 'laymos/story';

import { showingTheBoardInTheBrowser } from './25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';
import { editingTasksFromTheBrowser } from './26-editing-tasks-from-the-browser/editing-tasks-from-the-browser.story.js';
import { loadingOnlyTheBoardYoureLookingAt } from './27-loading-only-the-board-youre-looking-at/loading-only-the-board-youre-looking-at.story.js';
import { catchingUpOnWhatYouMissed } from './28-catching-up-on-what-you-missed/catching-up-on-what-you-missed.story.js';
import { typingFastWithoutFloodingTheServer } from './29-typing-fast-without-flooding-the-server/typing-fast-without-flooding-the-server.story.js';
import { boardSettingsInTheBrowser } from './30-board-settings-in-the-browser/board-settings-in-the-browser.story.js';
import { twoChangesAtOnceFromTheBrowser } from './31-two-changes-at-once-from-the-browser/two-changes-at-once-from-the-browser.story.js';
import { openingASecondTab } from './32-opening-a-second-tab/opening-a-second-tab.story.js';
import { onlyOneTabTalksToTheServer } from './33-only-one-tab-talks-to-the-server/only-one-tab-talks-to-the-server.story.js';
import { theNetworkGoesAway } from './34-the-network-goes-away/the-network-goes-away.story.js';
import { puttingItOnARealPage } from './35-putting-it-on-a-real-page/putting-it-on-a-real-page.story.js';

// Act V: chapters 25–35. Each chapter is added here in reading order.
export const actFive = Story.group(
  'In the browser',
  {
    description:
      'Show the board in a browser, edit it, catch up on what you missed, pace fast typing, share between tabs, survive going offline, and put it on a real page.',
  },
  [
    showingTheBoardInTheBrowser,
    editingTasksFromTheBrowser,
    loadingOnlyTheBoardYoureLookingAt,
    catchingUpOnWhatYouMissed,
    typingFastWithoutFloodingTheServer,
    boardSettingsInTheBrowser,
    twoChangesAtOnceFromTheBrowser,
    openingASecondTab,
    onlyOneTabTalksToTheServer,
    theNetworkGoesAway,
    puttingItOnARealPage,
  ],
);
