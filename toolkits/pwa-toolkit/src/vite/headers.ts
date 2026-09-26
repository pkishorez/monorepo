const BEGIN = '# pwa-toolkit: begin';
const END = '# pwa-toolkit: end';

const withoutManagedBlock = (text: string): string => {
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (begin === -1 || end < begin) return text;
  return text.slice(0, begin) + text.slice(end + END.length).replace(/^\n/, '');
};

/**
 * Cloudflare `_headers` with `Cache-Control: no-cache` for each path, so
 * browsers always revalidate the worker script and the manifest. The app's
 * own rules stay as they are; a path the app already lists is left to it.
 * Re-running replaces the toolkit's block instead of adding another.
 */
export const mergeHeaders = (
  existing: string | null,
  paths: ReadonlyArray<string>,
): string => {
  const own = withoutManagedBlock(existing ?? '');
  const listed = new Set(
    own
      .split('\n')
      .filter((line) => line.length > 0 && !/^\s/.test(line))
      .map((line) => line.trim()),
  );
  const rules = paths
    .filter((path) => !listed.has(path))
    .map((path) => `${path}\n  Cache-Control: no-cache`);
  if (rules.length === 0) return own;
  const head = own.length === 0 || own.endsWith('\n') ? own : `${own}\n`;
  return `${head}${BEGIN}\n${rules.join('\n')}\n${END}\n`;
};
