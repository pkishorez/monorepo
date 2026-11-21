import { readFileSync, writeFileSync } from 'node:fs';

/*
 * Run by the release, right after `changeset version`: a change that moved
 * what an older `ke-connect` reads sets `"raiseMinConnect": true` in
 * package.json, as it cannot name the version it will ship in. Here that
 * version is known, so the Minimum Connect becomes it, in package.json and
 * in frozen.json alike, and the flag goes. Without the flag it does nothing.
 */

const PACKAGE = new URL('../package.json', import.meta.url);
const FROZEN = new URL(
  '../src/contracts/heartbeat/tests/frozen.json',
  import.meta.url,
);

const json = (url: URL) =>
  JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
const write = (url: URL, value: unknown) =>
  writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`);

const pkg = json(PACKAGE);
if (pkg['raiseMinConnect'] === true) {
  const { raiseMinConnect: _, ...rest } = pkg;
  const version = String(pkg['version']);
  write(PACKAGE, { ...rest, minConnect: version });
  write(FROZEN, { ...json(FROZEN), minConnect: version });
  process.stdout.write(`Raised the Minimum Connect to ${version}.\n`);
}
