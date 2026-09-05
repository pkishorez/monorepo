import { Story } from 'laymos/story';

import { effectRpc } from './effect-rpc/index.js';

export default Story.group(
  'auth-toolkit',
  {
    description:
      'Protect a Consumer Backend one step at a time, then explore the important failure and concurrency edges.',
  },
  [effectRpc],
);
