import * as ts from 'typescript';

export interface SourceHighlight {
  readonly startLine: number;
  readonly endLine: number;
}

const testFunctionNames = new Set(['it', 'laymosTest', 'test']);

export function findTestSourceHighlight(
  filePath: string,
  content: string,
  testName: string,
): SourceHighlight | undefined {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const matches: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      testFunctionNames.has(rootCallName(node.expression) ?? '') &&
      argumentText(node.arguments[0]) === testName
    ) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  return {
    startLine:
      sourceFile.getLineAndCharacterOfPosition(match.getStart(sourceFile))
        .line + 1,
    endLine: sourceFile.getLineAndCharacterOfPosition(match.getEnd()).line + 1,
  };
}

function argumentText(node: ts.Expression | undefined): string | undefined {
  return node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function rootCallName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isCallExpression(expression))
    return rootCallName(expression.expression);
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    return rootCallName(expression.expression);
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return rootCallName(expression.expression);
  }
  return undefined;
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (
    filePath.endsWith('.js') ||
    filePath.endsWith('.cjs') ||
    filePath.endsWith('.mjs')
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}
