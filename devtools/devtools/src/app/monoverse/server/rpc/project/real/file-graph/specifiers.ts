import { parseSync, type ParseResult } from 'oxc-parser';

/** A file parsed by OXC: what its imports name, and the parse itself. */
export function parseSource(path: string, sourceText: string): ParseResult {
  return parseSync(path, sourceText);
}

/**
 * Every module a parsed file imports, re-exports from, or loads with
 * `import()` of a string literal, as written.
 */
export function specifiersOf(
  result: ParseResult,
  sourceText: string,
): Array<string> {
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
  for (const { moduleRequest } of result.module.dynamicImports) {
    const literal = /^(['"])(.*)\1$/s.exec(
      sourceText.slice(moduleRequest.start, moduleRequest.end),
    );
    if (literal?.[2] !== undefined) specifiers.push(literal[2]);
  }
  return specifiers;
}
