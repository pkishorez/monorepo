export const isGraphSource = (path: string): boolean =>
  /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) &&
  !/\.d\.[cm]?ts$/.test(path) &&
  !/\.min\.(?:[cm]?js|jsx)$/.test(path);
