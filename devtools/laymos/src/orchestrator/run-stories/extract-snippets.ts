import { parseSync } from 'oxc-parser';

export interface StorySnippets {
  readonly title: string | undefined;
  readonly proofs: ReadonlyMap<string, string>;
  readonly orderedProofs: readonly string[];
}

export interface ExtractedSnippets {
  readonly setup: string | null;
  readonly stories: readonly StorySnippets[];
}

interface AstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

interface SnippetBucket {
  readonly title: string | undefined;
  readonly proofs: Map<string, string>;
  readonly orderedProofs: string[];
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
  const unscoped = newBucket(undefined);
  const scoped: SnippetBucket[] = [];
  collectProofs(program.body, source, unscoped, scoped);
  const stories = [
    ...scoped,
    ...(unscoped.orderedProofs.length === 0 ? [] : [unscoped]),
  ];
  return {
    setup: setupParts.length === 0 ? null : setupParts.join('\n\n'),
    stories,
  };
}

export function storySnippets(
  extracted: ExtractedSnippets,
  title: string,
): StorySnippets {
  const matches = extracted.stories.filter((story) => story.title === title);
  if (matches.length === 1) return matches[0]!;
  return mergeSnippets(matches.length > 1 ? matches : extracted.stories);
}

function mergeSnippets(stories: readonly StorySnippets[]): StorySnippets {
  const merged = newBucket(undefined);
  for (const story of stories) {
    merged.orderedProofs.push(...story.orderedProofs);
    for (const [question, proof] of story.proofs) {
      merged.proofs.set(question, proof);
    }
  }
  return merged;
}

function newBucket(title: string | undefined): SnippetBucket {
  return { title, proofs: new Map(), orderedProofs: [] };
}

function collectProofs(
  node: unknown,
  source: string,
  bucket: SnippetBucket,
  stories: SnippetBucket[],
): void {
  if (Array.isArray(node)) {
    for (const item of node) collectProofs(item, source, bucket, stories);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const ast = node as AstNode;
  if (typeof ast.type !== 'string') return;
  let target = bucket;
  if (isStoryCall(ast, 'make')) {
    target = newBucket(storyTitle(ast));
    stories.push(target);
  } else if (isStoryCall(ast, 'question')) {
    const proof = questionProofSource(ast, source);
    if (proof !== undefined) {
      target.orderedProofs.push(proof);
      const question = questionLiteral(ast);
      if (question !== undefined) target.proofs.set(question, proof);
    }
  }
  for (const [key, value] of Object.entries(ast)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    collectProofs(value, source, target, stories);
  }
}

function storyTitle(call: AstNode): string | undefined {
  const argument = (call.arguments as AstNode[] | undefined)?.[0];
  if (argument?.type !== 'ObjectExpression') return undefined;
  for (const property of (argument.properties as AstNode[] | undefined) ?? []) {
    if (property.type !== 'Property') continue;
    if (propertyName(property) !== 'title') continue;
    return stringLiteral(property.value as AstNode | undefined);
  }
  return undefined;
}

function isStoryCall(node: AstNode, method: string): boolean {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee as AstNode | undefined;
  if (callee?.type !== 'MemberExpression') return false;
  const object = callee.object as AstNode | undefined;
  const property = callee.property as AstNode | undefined;
  return (
    object?.type === 'Identifier' &&
    (object as { name?: string }).name === 'Story' &&
    property?.type === 'Identifier' &&
    (property as { name?: string }).name === method
  );
}

function propertyName(property: AstNode): string | undefined {
  const key = property.key as AstNode | undefined;
  if (key?.type === 'Identifier') return (key as { name?: string }).name;
  if (key?.type === 'Literal')
    return String((key as { value?: unknown }).value);
  return undefined;
}

function stringLiteral(node: AstNode | undefined): string | undefined {
  if (node?.type === 'Literal') {
    const value = (node as { value?: unknown }).value;
    return typeof value === 'string' ? value : undefined;
  }
  if (node?.type === 'TemplateLiteral') {
    const quasis = node.quasis as
      | { cooked?: string | null; value?: { cooked?: string | null } }[]
      | undefined;
    if (quasis?.length === 1) {
      const cooked = quasis[0]?.value?.cooked ?? quasis[0]?.cooked;
      return typeof cooked === 'string' ? cooked : undefined;
    }
  }
  return undefined;
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
  return stringLiteral((call.arguments as AstNode[] | undefined)?.[0]);
}

function questionProofSource(
  call: AstNode,
  source: string,
): string | undefined {
  const options = (call.arguments as AstNode[] | undefined)?.[1];
  if (options?.type !== 'ObjectExpression') return undefined;
  for (const property of (options.properties as AstNode[] | undefined) ?? []) {
    if (property.type !== 'Property') continue;
    if (propertyName(property) !== 'proof') continue;
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
