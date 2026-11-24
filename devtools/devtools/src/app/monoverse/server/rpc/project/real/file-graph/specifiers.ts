import { parseSync } from 'oxc-parser';

/** Every module a file imports or re-exports from, as written. */
export function extractSpecifiers(
  path: string,
  sourceText: string,
): Array<string> {
  const result = parseSync(path, sourceText);
  const specifiers: Array<string> = [];
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
