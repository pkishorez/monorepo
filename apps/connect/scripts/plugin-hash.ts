import { readFileSync } from 'node:fs';
import { CODE_BUNDLE, sha256 } from '../infra/plugins.ts';

/* Prints the sha256 of the code Plugin's bundle: the hash a deploy names, as infra/plugins.ts works it out. */

process.stdout.write(
  `${sha256(readFileSync(CODE_BUNDLE))}  dist/plugin/code.mjs\n`,
);
