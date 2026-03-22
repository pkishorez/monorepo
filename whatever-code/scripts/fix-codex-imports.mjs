import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "src/codex/generated";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else if (e.name.endsWith(".ts")) files.push(p);
  }
  return files;
}

const files = await walk(ROOT);
for (const file of files) {
  let src = await readFile(file, "utf8");
  const updated = src.replace(/from "(\.\.?\/[^"]+)(?<!\.js)"/g, 'from "$1.js"');
  if (file === join(ROOT, "index.ts")) {
    const fixed = updated.replace('"./v2.js"', '"./v2/index.js"');
    if (fixed !== src) await writeFile(file, fixed);
  } else if (updated !== src) {
    await writeFile(file, updated);
  }
}

console.log(`Fixed imports in ${files.length} files`);
