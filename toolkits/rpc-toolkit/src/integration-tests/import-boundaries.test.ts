import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function externalImports(entry: string, seen = new Set<string>()): Set<string> {
  const file = resolve(root, entry);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
  );
  const result = new Set<string>();
  const visit = (node: ts.Node) => {
    // A type-only import is gone at runtime, so it never reaches a bundle.
    const typeOnly =
      (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(node) && node.isTypeOnly);
    const specifier = typeOnly
      ? undefined
      : ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined;
    if (specifier && ts.isStringLiteral(specifier)) {
      const path = specifier.text;
      if (path.startsWith('.')) {
        for (const dependency of externalImports(
          resolve(dirname(file), path.replace(/\.js$/, '.ts')),
          seen,
        ))
          result.add(dependency);
      } else result.add(path);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

it('keeps the rpc and http-api doors free of Cloudflare and Alchemy at runtime', () => {
  for (const entry of ['rpc', 'http-api']) {
    const imports = externalImports(`rpc-toolkit/src/${entry}/index.ts`);
    expect(
      [...imports].filter((name) => /^(alchemy|@cloudflare)(\/|$)/.test(name)),
    ).toEqual([]);
  }
});

it('keeps the ordinary DynamoDB entry point independent of Alchemy', () => {
  expect(
    [...externalImports('std-toolkit/src/db/dynamodb/index.ts')].filter(
      (name) => /^alchemy(\/|$)/.test(name),
    ),
  ).toEqual([]);
});
