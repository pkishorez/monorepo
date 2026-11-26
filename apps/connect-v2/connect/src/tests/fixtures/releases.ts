import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const made: Array<string> = [];

export const folder = (prefix = 'kc2-') => {
  const at = mkdtempSync(join(tmpdir(), prefix));
  made.push(at);
  return at;
};

export const cleanUp = () => {
  for (const at of made.splice(0)) rmSync(at, { recursive: true, force: true });
};

const fixture = (name: string) =>
  fileURLToPath(new URL(`./${name}`, import.meta.url));

export const releaseOf = (
  name: 'echo.mjs' | 'crash.mjs' | 'headers.mjs',
  salt = '',
) => {
  const content = `${salt}await import(${JSON.stringify(pathToFileURL(fixture(name)).href)});\n`;
  const hash = createHash('sha256').update(content).digest('hex');
  const file = join(folder(), `${hash}.mjs`);
  writeFileSync(file, content);
  return { hash, url: pathToFileURL(file).href };
};
