import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Copies the Claude Agent SDK's JavaScript into dist/vendor, and points
 * every import of it in dist there, so the published package carries the
 * SDK without depending on it. npm then never installs the SDK's optional
 * platform packages, each a Claude Code binary of about 270 MB: the
 * harness always runs the Claude Code the user installed. `sdk.mjs` is one
 * file that imports nothing but Node's own modules.
 */

const SDK = '@anthropic-ai/claude-agent-sdk';
const dist = join(import.meta.dirname, '..', 'dist');
const vendor = join(dist, 'vendor', 'claude-agent-sdk');

const from = dirname(fileURLToPath(import.meta.resolve(SDK)));
await mkdir(vendor, { recursive: true });
for (const file of ['sdk.mjs', 'LICENSE.md', 'package.json'])
  await copyFile(join(from, file), join(vendor, file));

const files = async (folder: string): Promise<ReadonlyArray<string>> =>
  (
    await Promise.all(
      (await readdir(folder, { withFileTypes: true })).map((entry) => {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) return path === vendor ? [] : files(path);
        return entry.name.endsWith('.js') ? [path] : [];
      }),
    )
  ).flat();

let pointed = 0;
for (const file of await files(dist)) {
  const source = await readFile(file, 'utf8');
  if (!source.includes(`'${SDK}'`)) continue;
  // An import path is written with `/`, even on Windows.
  let target = relative(dirname(file), join(vendor, 'sdk.mjs'))
    .split(sep)
    .join('/');
  if (!target.startsWith('.')) target = `./${target}`;
  await writeFile(
    file,
    source.replaceAll(`'${SDK}'`, () => JSON.stringify(target)),
  );
  pointed += 1;
}
if (pointed === 0) throw new Error(`No file in dist imports ${SDK}`);
console.log(
  `Vendored ${SDK} into ${relative(process.cwd(), vendor)} for ${pointed} files`,
);
