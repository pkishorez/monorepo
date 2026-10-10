// Usage: pnpm render <composition> [remotion flags]
// Renders one Explainer, or one Style of a Walkthrough, to
// generated/<composition>.mp4 (git-ignored). Extra flags go to Remotion, such
// as --props='{"look":"plain"}' to show another Look's recordings.
import { execFileSync } from 'node:child_process';

const [name, ...flags] = process.argv.slice(2);
if (!name) throw new Error('Usage: pnpm render <composition>');

execFileSync(
  'pnpm',
  [
    'exec',
    'remotion',
    'render',
    'src/studio.tsx',
    name,
    `generated/${name}.mp4`,
    ...flags,
  ],
  { stdio: 'inherit' },
);
