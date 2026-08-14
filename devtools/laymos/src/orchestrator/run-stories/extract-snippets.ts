import { parseSync } from 'oxc-parser';

export interface ExtractedSnippets {
  readonly setup: string | null;
  readonly proofs: ReadonlyMap<string, string>;
  readonly orderedProofs: readonly string[];
}

interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

export function extractSnippets(
  path: string,
  source: string,
): ExtractedSnippets {
  const program = parseSync(path, source).program as unknown as {
    body: AstNode[];
  };
  const setupParts: string[] = [];
  for (const statement of program.body) {
    if (statement.type.startsWith('TSImport')) continue;
    if (statement.type === 'ImportDeclaration') continue;
    if (containsStoryCall(statement)) continue;
    setupParts.push(source.slice(statement.start, statement.end));
  }
  const proofs = new Map<string, string>();
  const orderedProofs: string[] = [];
  for (const call of collectQuestionCalls(program.body)) {
    const proof = questionProofSource(call, source);
    if (proof === undefined) continue;
    orderedProofs.push(proof);
    const question = questionLiteral(call);
    if (question !== undefined) proofs.set(question, proof);
  }
  return {
    setup: setupParts.length === 0 ? null : setupParts.join('\n\n'),
    proofs,
    orderedProofs,
  };
}

function collectQuestionCalls(roots: readonly AstNode[]): AstNode[] {
  const calls: AstNode[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const ast = node as AstNode;
    if (typeof ast.type === 'string' && isQuestionCall(ast)) calls.push(ast);
    for (const [key, value] of Object.entries(ast)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      visit(value);
    }
  };
  visit(roots);
  return calls;
}

function isQuestionCall(node: AstNode): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee as AstNode | undefined;
  if (callee?.type !== 'MemberExpression') return false;
  const object = callee.object as AstNode | undefined;
  const property = callee.property as AstNode | undefined;
  return (
    object?.type === 'Identifier' &&
    (object as { name?: string }).name === 'Story' &&
    property?.type === 'Identifier' &&
    (property as { name?: string }).name === 'question'
  );
}

function containsStoryCall(statement: AstNode): boolean {
  let found = false;
  const visit = (node: unknown): void => {
    if (found) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const ast = node as AstNode;
    if (
      ast.type === 'MemberExpression' &&
      (ast.object as AstNode | undefined)?.type === 'Identifier' &&
      (ast.object as { name?: string }).name === 'Story'
    ) {
      found = true;
      return;
    }
    for (const [key, value] of Object.entries(ast)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      visit(value);
    }
  };
  visit(statement);
  return found;
}

function questionLiteral(call: AstNode): string | undefined {
  const argument = (call.arguments as AstNode[] | undefined)?.[0];
  if (argument?.type === 'Literal') {
    const value = (argument as { value?: unknown }).value;
    return typeof value === 'string' ? value : undefined;
  }
  if (argument?.type === 'TemplateLiteral') {
    const quasis = argument.quasis as
      | { cooked?: string | null; value?: { cooked?: string | null } }[]
      | undefined;
    if (quasis?.length === 1) {
      const cooked = quasis[0]?.value?.cooked ?? quasis[0]?.cooked;
      return typeof cooked === 'string' ? cooked : undefined;
    }
  }
  return undefined;
}

function questionProofSource(
  call: AstNode,
  source: string,
): string | undefined {
  const options = (call.arguments as AstNode[] | undefined)?.[1];
  if (options?.type !== 'ObjectExpression') return undefined;
  for (const property of (options.properties as AstNode[] | undefined) ?? []) {
    if (property.type !== 'Property') continue;
    const key = property.key as AstNode | undefined;
    const name =
      key?.type === 'Identifier'
        ? (key as { name?: string }).name
        : key?.type === 'Literal'
          ? String((key as { value?: unknown }).value)
          : undefined;
    if (name !== 'proof') continue;
    const value = property.value as AstNode | undefined;
    if (value === undefined) return undefined;
    return dedent(source.slice(value.start, value.end));
  }
  return undefined;
}

function dedent(snippet: string): string {
  const lines = snippet.split('\n');
  const indents = lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => /^\s*/.exec(line)![0].length);
  if (indents.length === 0) return snippet;
  const strip = Math.min(...indents);
  return [lines[0]!, ...lines.slice(1).map((line) => line.slice(strip))].join(
    '\n',
  );
}
