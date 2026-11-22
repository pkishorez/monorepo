import { withConnect } from '@kestack/connect/dev';

// Real mode, `pnpm dev:connect`: this branch's Connect, started or reused,
// then only Code's site against it. `pnpm dev` is fake mode, and runs no
// Connect.
await withConnect({
  app: 'code',
  command: 'portless',
  args: ['run', '--force', 'alchemy', 'dev'],
});
