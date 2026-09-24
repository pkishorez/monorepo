export type SnapshotEntry = Drawn | Failed;

interface Image {
  readonly theme: 'dark' | 'light';
  readonly out: string;
  readonly width: number;
  readonly height: number;
}

interface Drawn {
  readonly project: string;
  readonly title: string;
  readonly modules: number;
  readonly changedModules: number;
  readonly images: readonly Image[];
}

interface Failed {
  readonly project: string;
  readonly error: string;
}

const heading = '## Architecture changes';

export const placeholder = `${heading}\n\n⏳ Drawing the changed Projects…`;

export function buildComment(
  entries: readonly SnapshotEntry[],
  base: string,
): { markdown: string; create: boolean; files: string[] } {
  const sections = [];
  const failures = [];
  for (const entry of entries) {
    if ('error' in entry) {
      failures.push(
        `> [!WARNING]\n> \`${entry.project}\` could not be drawn: ${entry.error.split('\n')[0]}`,
      );
    } else if (entry.images.length > 0) {
      sections.push(
        `### \`${entry.title}\`\n\n${entry.changedModules} of ${entry.modules} Modules changed\n\n${picture(entry.images, entry.title)}`,
      );
    }
  }
  const intro =
    sections.length > 0
      ? `Changed Modules since \`${base}\`, drawn by [Laymos](https://github.com/pkishorez/monorepo/tree/main/devtools/laymos).`
      : `No Module changed since \`${base}\`.`;
  return {
    markdown: [heading, intro, ...sections, ...failures].join('\n\n'),
    create: sections.length + failures.length > 0,
    files: entries.flatMap((entry) =>
      'error' in entry ? [] : entry.images.map((image) => image.out),
    ),
  };
}

function picture(images: readonly Image[], alt: string) {
  const dark = images.find((image) => image.theme === 'dark');
  const light = images.find((image) => image.theme === 'light');
  const fallback = light ?? dark;
  if (fallback === undefined) return '';
  const img = `<img alt="${alt}" src="${fallback.out}" width="${fallback.width}">`;
  if (dark === undefined || light === undefined) return img;
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="${dark.out}">${img}</picture>`;
}
