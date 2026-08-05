import { readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';

import { parseSync } from 'oxc-parser';
import { ResolverFactory } from 'oxc-resolver';

import { sourceExtensions, toPosixPath } from './file-scanner.js';

export function createResolver(): ResolverFactory {
  return new ResolverFactory({
    tsconfig: 'auto',
    extensions: sourceExtensions,
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
  });
}

export async function extractSpecifiers(
  absolutePath: string,
): Promise<string[]> {
  const sourceText = await readFile(absolutePath, 'utf8');
  const result = parseSync(absolutePath, sourceText);
  const specifiers: string[] = [];
  for (const staticImport of result.module.staticImports) {
    specifiers.push(staticImport.moduleRequest.value);
  }
  for (const staticExport of result.module.staticExports) {
    for (const entry of staticExport.entries) {
      if (entry.moduleRequest !== null) {
        specifiers.push(entry.moduleRequest.value);
      }
    }
  }
  return specifiers;
}

export function resolveSpecifier(
  resolver: ResolverFactory,
  baseDir: string,
  eligible: ReadonlySet<string>,
  fromFile: string,
  specifier: string,
): string | undefined {
  const result = resolver.resolveFileSync(fromFile, specifier);
  if (result.builtin !== undefined || result.path === undefined) {
    return undefined;
  }
  if (result.path.split(sep).includes('node_modules')) {
    return undefined;
  }
  const relativePath = toPosixPath(relative(baseDir, result.path));
  return eligible.has(relativePath) ? relativePath : undefined;
}
