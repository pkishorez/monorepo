import type { FileDiff } from 'laymos';

import { DiffViewer } from './diff-viewer';

const diff: FileDiff = {
  path: 'src/services/git/git.ts',
  hunks: [
    {
      header: '@@ -1,8 +1,10 @@',
      oldStart: 1,
      newStart: 1,
      lines: [
        {
          kind: 'context',
          content: "import { Context, Effect, Layer } from 'effect';",
          oldNumber: 1,
          newNumber: 1,
        },
        { kind: 'context', content: '', oldNumber: 2, newNumber: 2 },
        {
          kind: 'removed',
          content:
            "import type { ChangeSet } from '../../change-set-schema/index.js';",
          oldNumber: 3,
        },
        {
          kind: 'added',
          content:
            "import type { ChangeSet, FileDiff } from '../../change-set-schema/index.js';",
          newNumber: 3,
        },
        {
          kind: 'added',
          content: "import { parsePatch } from './parse-patch.js';",
          newNumber: 4,
        },
        {
          kind: 'context',
          content: "import { GitError } from './errors.js';",
          oldNumber: 4,
          newNumber: 5,
        },
      ],
    },
    {
      header: '@@ -20,4 +22,8 @@ export const GitLive = Layer.succeed(Git)({',
      oldStart: 20,
      newStart: 22,
      lines: [
        {
          kind: 'context',
          content: '      catch: (cause) => asGitError(cause, baseDir),',
          oldNumber: 20,
          newNumber: 22,
        },
        {
          kind: 'added',
          content: '  fileDiff: (baseDir, baseRef, path) =>',
          newNumber: 23,
        },
        {
          kind: 'added',
          content: '    Effect.tryPromise({',
          newNumber: 24,
        },
        { kind: 'context', content: '});', oldNumber: 21, newNumber: 25 },
      ],
    },
  ],
};

export default {
  'split (default)': (
    <div className="h-[600px] p-4">
      <DiffViewer diff={diff} />
    </div>
  ),
  unified: (
    <div className="h-[600px] p-4">
      <DiffViewer diff={diff} defaultLayout="unified" />
    </div>
  ),
  'no changes': (
    <div className="h-[300px] p-4">
      <DiffViewer diff={{ path: 'src/a.ts', hunks: [] }} />
    </div>
  ),
};
