import { dirname, matchesGlob, relative } from 'node:path';
import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import {
  isIndexFile,
  isInside,
  moduleOf,
  ownerThrough,
  packageOf,
  resolveImport,
} from '../tree/index.ts';
import { stringsAt } from '../options/index.ts';

/*
 * `kestack/imports`: a file may import
 *
 *   1. any file in its own module;
 *   2. below it, the index file of any module, at any depth;
 *   3. beside or above it, a door: the index file of a door folder, or of
 *      a folder directly inside one, that its own folder or a folder above
 *      it owns.
 *
 * Nothing else. A package import is never checked.
 */

export interface ImportsOptions {
  /** Door folders, as paths from the folder that owns them: `logic/shared`, `services/*\/contract`. */
  readonly doors: readonly string[];
  /** Files the rule skips, as globs: `**\/tests/**`. */
  readonly ignore?: readonly string[];
}

type Verdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'inside'; readonly entry: string }
  | { readonly ok: false; readonly reason: 'door' };

/** Whether `importer` may import `target`, by the three cases above. */
export const judge = (
  importer: string,
  target: string,
  doors: readonly string[],
): Verdict => {
  const root = packageOf(dirname(importer));
  if (!isInside(target, root)) return { ok: true };
  const own = moduleOf(dirname(importer), root);
  const targetModule = moduleOf(dirname(target), root);
  if (targetModule === own) return { ok: true };

  if (isInside(target, own))
    return isIndexFile(target)
      ? { ok: true }
      : { ok: false, reason: 'inside', entry: targetModule };

  if (isIndexFile(target) && isDoorIndex(importer, dirname(target), doors))
    return { ok: true };
  return { ok: false, reason: 'door' };
};

/** Whether `dir` is a door, or a folder directly in one, that a folder holding `importer` owns. */
const isDoorIndex = (
  importer: string,
  dir: string,
  doors: readonly string[],
): boolean =>
  [dir, dirname(dir)].some((folder) =>
    doors.some((door) => {
      const owner = ownerThrough(folder, door);
      return owner !== undefined && isInside(importer, owner);
    }),
  );

export const imports = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'A file imports its own module, the index file of any module below it, or a door beside or above it.',
    },
    messages: {
      inside:
        "'{{source}}' reaches inside {{entry}}. Import {{entry}}/index.ts, and export what you need from there.",
      door: "'{{source}}' is beside or above this file and is not a door. Import a door's index file ({{doors}}), or move what you need into one.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          doors: { type: 'array', items: { type: 'string' } },
          ignore: { type: 'array', items: { type: 'string' } },
        },
        required: ['doors'],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const doors = stringsAt(context.options, 'doors');
    const ignore = stringsAt(context.options, 'ignore');
    const file = context.filename;
    const root = packageOf(dirname(file));
    // From the package, so a dot folder above it (`.claude/`) never stops `**`.
    const path = relative(root, file);
    if (ignore.some((glob) => matchesGlob(path, glob))) return {};

    const check = (source: ESTree.StringLiteral | null | undefined) => {
      if (!source || typeof source.value !== 'string') return;
      const target = resolveImport(file, source.value);
      if (!target) return;
      const verdict = judge(file, target, doors);
      if (verdict.ok) return;
      if (verdict.reason === 'inside')
        context.report({
          node: source,
          messageId: 'inside',
          data: { source: source.value, entry: relative(root, verdict.entry) },
        });
      else
        context.report({
          node: source,
          messageId: 'door',
          data: { source: source.value, doors: doors.join(', ') },
        });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => {
        if (node.source.type === 'Literal')
          check(node.source as ESTree.StringLiteral);
      },
    };
  },
});
