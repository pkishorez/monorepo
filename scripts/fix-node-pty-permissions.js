// node-pty ships a `spawn-helper` binary in its prebuilds directory.
// The npm tarball for node-pty@1.1.0 publishes this file with 644 (no execute
// bit). npm/yarn/bun restore execute permissions on extraction, but pnpm's
// content-addressable store preserves the original tarball permissions — so the
// binary stays non-executable and `posix_spawnp` fails at runtime.
//
// Upstream fix: https://github.com/microsoft/node-pty/pull/866
// Tracked in:   https://github.com/microsoft/node-pty/issues/850
//
// This script is a workaround until a fixed version is published. Remove it
// once node-pty ships a tarball with correct permissions.

const path = require('path');
const fs = require('fs');
const { globSync } = require('fs');

const pattern = path.join(
  __dirname,
  '..',
  'node_modules',
  '.pnpm',
  'node-pty@*',
  'node_modules',
  'node-pty',
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'spawn-helper',
);

for (const file of globSync(pattern)) {
  fs.chmodSync(file, 0o755);
}
