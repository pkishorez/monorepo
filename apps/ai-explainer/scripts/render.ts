// Usage: pnpm render <explainer>
// Renders one Explainer to generated/<explainer>.mp4 (git-ignored).
import { execFileSync } from 'node:child_process';

const name = process.argv[2];
if (!name) throw new Error('Usage: pnpm render <explainer>');

execFileSync(
  'pnpm',
  [
    'exec',
    'remotion',
    'render',
    'src/studio.tsx',
    name,
    `generated/${name}.mp4`,
  ],
  { stdio: 'inherit' },
);
