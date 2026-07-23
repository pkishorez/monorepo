import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface StorySurface {
  readonly modulePath: string;
  readonly moduleDescription: string;
  readonly path: string;
}

export async function findStorySurfaces(
  baseDir: string,
  modules: readonly {
    readonly path: string;
    readonly description: string;
  }[],
): Promise<readonly StorySurface[]> {
  const surfaces: StorySurface[] = [];
  for (const module of modules) {
    try {
      const moduleStat = await stat(join(baseDir, module.path));
      if (!moduleStat.isDirectory()) continue;
      const path = `${module.path === '.' ? '' : `${module.path}/`}stories`;
      const storiesStat = await stat(join(baseDir, path));
      if (!storiesStat.isDirectory()) continue;
      surfaces.push({
        modulePath: module.path,
        moduleDescription: module.description,
        path,
      });
    } catch (cause) {
      if (
        cause instanceof Error &&
        'code' in cause &&
        cause.code === 'ENOENT'
      ) {
        continue;
      }
      throw cause;
    }
  }
  return surfaces;
}
