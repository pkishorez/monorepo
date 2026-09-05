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
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
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

it('keeps browser and contract imports independent of Cloudflare and Alchemy', () => {
  for (const entry of [
    'rpc/cannotation',
    'http/cannotation',
    'rpc/invocation',
    'rpc/websocket-client',
  ]) {
    const imports = externalImports(`rpc-toolkit/src/${entry}/index.ts`);
    expect(
      [...imports].filter((name) => /^(alchemy|@cloudflare)(\/|$)/.test(name)),
    ).toEqual([]);
  }
});

it('keeps the hibernating runtime independent of Alchemy', () => {
  expect(
    [
      ...externalImports(
        'rpc-toolkit/src/rpc/cloudflare/hibernating-rpc/index.ts',
      ),
    ].filter((name) => /^alchemy(\/|$)/.test(name)),
  ).toEqual([]);
});

it('keeps the ordinary DynamoDB entry point independent of Alchemy', () => {
  expect(
    [...externalImports('../std-toolkit/src/db/dynamodb/index.ts')].filter(
      (name) => /^alchemy(\/|$)/.test(name),
    ),
  ).toEqual([]);
});
