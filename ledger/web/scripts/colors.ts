// Fails when src/ uses a colour the theme doesn't give: a Tailwind palette
// colour (`emerald-500`) or a raw hex, rgb, hsl or oklch value. Every colour
// is a ui-toolkit token (`foreground`, `muted-foreground`, `destructive`…);
// see DESIGN.md. The one exception is the iOS status bar, which needs plain
// sRGB in `light-dark()`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PALETTE =
  /\b[a-z-]+-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const RAW =
  /(?<![\w&-])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/;

const files = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.endsWith('.gen.ts')
      ? [path]
      : [];
  });

const found = files('src').flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, i) =>
      !line.includes('light-dark(') && (PALETTE.test(line) || RAW.test(line))
        ? [`${file}:${i + 1}: ${line.trim()}`]
        : [],
    ),
);

if (found.length > 0) {
  console.error(
    `Colours the theme doesn't give (use a ui-toolkit token):\n${found.join('\n')}`,
  );
  process.exit(1);
}
console.log('✓ Only theme colours');
