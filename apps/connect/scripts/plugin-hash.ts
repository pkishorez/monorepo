import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/* Prints the sha256 of the code Plugin's bundle: the hash Connect is told to run. */

const file = new URL('../dist/plugin/code.mjs', import.meta.url);
const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
process.stdout.write(`${hash}  dist/plugin/code.mjs\n`);
