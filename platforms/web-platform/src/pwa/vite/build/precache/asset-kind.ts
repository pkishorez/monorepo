const DEFAULT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
]);

const extensionOf = (path: string): string => {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash ? path.slice(dot).toLowerCase() : '';
};

/** Scripts, styles and fonts: what the App Shell needs to boot. */
export const isDefaultAsset = (path: string): boolean =>
  DEFAULT_EXTENSIONS.has(extensionOf(path));

export const isHtml = (path: string): boolean => extensionOf(path) === '.html';

export const isSourceMap = (path: string): boolean =>
  extensionOf(path) === '.map';
