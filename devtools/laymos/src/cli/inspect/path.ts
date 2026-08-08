import { dirname, relative, resolve, sep } from 'node:path';

export function resolveInspectionTarget(
  configuredPath: string,
  target: string,
): { readonly configPath: string; readonly target: string } {
  const configPath = resolve(configuredPath);
  const baseDir = dirname(configPath);
  const relativePath = relative(baseDir, resolve(baseDir, target));
  return {
    configPath,
    target: sep === '/' ? relativePath : relativePath.split(sep).join('/'),
  };
}
