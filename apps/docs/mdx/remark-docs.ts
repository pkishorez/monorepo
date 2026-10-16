import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { anchor } from '../src/shared/content/kabuki.ts';

/*
 * What every docs page's MDX goes through before it is compiled:
 *
 * 1. Include  a code block written ```ts file=./components/counter.ts is
 *             that file, so the code a page shows is the code its demo runs.
 * 2. Anchor   every `##` and `###` heading gets an id, made the way the
 *             table of contents makes one.
 * 3. Export   the page's headings as `headings`, for its "On this page".
 */

type Node = {
  type: string;
  depth?: number;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  children?: Array<Node>;
  data?: Record<string, unknown>;
};

const textOf = (node: Node): string =>
  node.value ?? (node.children ?? []).map(textOf).join('');

const walk = (node: Node, visit: (node: Node) => void) => {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
};

// The `headings` export, written as the ESTree MDX compiles.
const literal = (value: string | number) => ({ type: 'Literal', value });
const property = (key: string, value: string | number) => ({
  type: 'Property',
  key: { type: 'Identifier', name: key },
  value: literal(value),
  kind: 'init',
  method: false,
  shorthand: false,
  computed: false,
});
const exportHeadings = (
  headings: ReadonlyArray<{ id: string; title: string; depth: number }>,
): Node => ({
  type: 'mdxjsEsm',
  value: '',
  data: {
    estree: {
      type: 'Program',
      sourceType: 'module',
      body: [
        {
          type: 'ExportNamedDeclaration',
          specifiers: [],
          source: null,
          declaration: {
            type: 'VariableDeclaration',
            kind: 'const',
            declarations: [
              {
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: 'headings' },
                init: {
                  type: 'ArrayExpression',
                  elements: headings.map((heading) => ({
                    type: 'ObjectExpression',
                    properties: Object.entries(heading).map(([key, value]) =>
                      property(key, value),
                    ),
                  })),
                },
              },
            ],
          },
        },
      ],
    },
  },
});

export const remarkDocs =
  () =>
  (tree: Node, file: { path: string }): void => {
    const headings: Array<{ id: string; title: string; depth: number }> = [];
    walk(tree, (node) => {
      // 1. Include
      const included = node.type === 'code' && node.meta?.match(/file=(\S+)/);
      if (included) {
        const path = resolve(dirname(file.path), included[1]!);
        node.value = readFileSync(path, 'utf8').trimEnd();
      }
      // 2. Anchor
      if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) {
        const title = textOf(node);
        const id = anchor(title);
        node.data = { ...node.data, hProperties: { id } };
        headings.push({ id, title, depth: node.depth });
      }
    });
    // 3. Export
    tree.children?.push(exportHeadings(headings));
  };
