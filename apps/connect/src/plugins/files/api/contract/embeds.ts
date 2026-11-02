/*
 * A File Embed: a file the agent shows the user by writing
 * `![caption](files:<path>)` in its text, the path absolute or relative to
 * the folder its Session runs in. Code shows only these, and a markdown
 * file it shows reads its own the same way.
 */

/** The scheme of a File Embed's link: `files:`. */
export const FILE_EMBED_SCHEME = 'files:';

/** Undoes the percent-encoding a markdown parser gives a link; a link that is not valid encoding is kept as written. */
const decoded = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/**
 * The path a File Embed's link names, `files:<path>` → `<path>`, decoded
 * as a markdown parser encodes it; null for any other link, and for one
 * naming no path.
 */
export const embedPath = (href: string): string | null => {
  const link = href.trim();
  if (!link.toLowerCase().startsWith(FILE_EMBED_SCHEME)) return null;
  const path = decoded(link.slice(FILE_EMBED_SCHEME.length)).trim();
  return path === '' ? null : path;
};
