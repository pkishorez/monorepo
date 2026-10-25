import { withConnect } from '@kestack/connect/dev';

// This branch's Connect, started or reused, then only Code's site against it.
await withConnect({
  app: 'code',
  command: 'portless',
  args: ['run', '--force', 'alchemy', 'dev'],
});
