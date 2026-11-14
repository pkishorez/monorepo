/** `base` as `/` or `/app/`. */
export const normalizeBase = (base: string): string => {
  const withLead = base.startsWith('/') ? base : `/${base}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
};

/** Origin-relative URL of a file under the client outDir. */
export const urlOf = (path: string, base: string): string =>
  `${normalizeBase(base)}${path}`;

/**
 * Output path of a same-origin URL such as a manifest icon `src`, or `null`
 * when it points elsewhere (another origin, a data URL).
 */
export const outputPathOf = (url: string, base: string): string | null => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null;
  const path = (url.split(/[?#]/)[0] ?? '').replace(/^\.\//, '');
  if (!path.startsWith('/')) return path;
  const prefix = normalizeBase(base);
  return path.startsWith(prefix) ? path.slice(prefix.length) : path.slice(1);
};
