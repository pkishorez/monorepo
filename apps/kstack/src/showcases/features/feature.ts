import type { LucideIcon } from '@kstackz/ui-toolkit/lucide';
import type { ComponentType } from 'react';
import type { CodeFile } from '../../common/code.tsx';

/**
 * One end-to-end app in the Features Showcase, where several gestures meet
 * on one screen, such as a mail inbox. It fills the whole screen inside its
 * own Gesture Provider, and builds its own zones.
 */
export interface Feature {
  readonly slug: string;
  readonly title: string;
  readonly icon: LucideIcon;
  /** Its Scenarios, one sentence each: what to try, and what happens. */
  readonly tries: ReadonlyArray<string>;
  readonly App: ComponentType;
  readonly files: ReadonlyArray<CodeFile>;
}

/**
 * Every file of a Feature's folder, for "Code", from
 * `import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })`.
 * Its door and orchestrator come last: the app itself reads first.
 */
export const codeFiles = (
  slug: string,
  glob: Readonly<Record<string, unknown>>,
): ReadonlyArray<CodeFile> =>
  Object.entries(glob)
    .map(([path, content]) => ({
      path: `showcases/features/${slug}/${path.replace(/^\.\//, '')}`,
      content: String(content),
    }))
    .sort(
      (a, b) =>
        rank(a.path, slug) - rank(b.path, slug) || a.path.localeCompare(b.path),
    );

const rank = (path: string, slug: string) => {
  const name = path.split('/').at(-1);
  if (name === 'index.ts') return 2;
  if (name === `${slug}.ts` || name === `${slug}.tsx`) return 1;
  return 0;
};
