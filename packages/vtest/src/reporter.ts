import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

import type {
  FileNode,
  FolderDoc,
  PackageMeta,
  ReportSummary,
  SourceLocation,
  SuiteNode,
  TestNode,
  TestStatus,
  VTestReport,
} from './types.ts';

type VitestTaskState =
  | 'pass'
  | 'fail'
  | 'skip'
  | 'todo'
  | 'run'
  | 'only'
  | 'queued';

type VitestTaskBase = {
  name: string;
  type: 'test' | 'suite' | 'custom';
  mode?: 'skip' | 'todo' | 'run' | 'only' | 'queued';
  meta?: object;
  location?: { line: number; column: number };
  result?: {
    state?: VitestTaskState;
    duration?: number;
    errors?: Array<{
      message: string;
      stack?: string;
      stackStr?: string;
      expected?: unknown;
      actual?: unknown;
    }>;
  };
};

type VitestSuite = VitestTaskBase & { type: 'suite'; tasks: VitestTask[] };
type VitestTestTask = VitestTaskBase & { type: 'test' };
type VitestTask = VitestSuite | VitestTestTask | VitestTaskBase;
type VitestFile = VitestSuite & { filepath: string };

export type VTestReporterOptions = {
  /** Output JSON path. Default: `<root>/.report.json`. */
  outFile?: string;
  /** Directory holding `home.md` and `<name>.doc.md` files. Default: `./vtest`. */
  root?: string;
};

const VDOC_KEY = 'vdoc';

const readVdoc = (meta: object | undefined): string | undefined => {
  const v = (meta as Record<string, unknown> | undefined)?.[VDOC_KEY];
  return typeof v === 'string' ? v : undefined;
};

const stringifyValue = (v: unknown): string => {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

const mapStatus = (task: VitestTaskBase): TestStatus => {
  const state = task.result?.state;
  if (state === 'pass') return 'pass';
  if (state === 'fail') return 'fail';
  if (state === 'skip') return 'skip';
  if (state === 'todo') return 'todo';
  if (state === 'run') return 'running';
  if (task.mode === 'skip') return 'skip';
  if (task.mode === 'todo') return 'todo';
  return 'skip';
};

type SnippetExtractor = (
  loc: SourceLocation | undefined,
) => { snippet: string; startLine: number } | undefined;

const convertTask = (
  task: VitestTask,
  extractSnippet: SnippetExtractor,
): SuiteNode | TestNode => {
  if (task.type === 'suite') {
    const suite = task as VitestSuite;
    const doc = readVdoc(suite.meta);
    return {
      kind: 'suite',
      name: suite.name,
      ...(doc !== undefined && { doc }),
      children: suite.tasks.map((c) => convertTask(c, extractSnippet)),
    };
  }
  const t = task as VitestTestTask;
  const firstError = t.result?.errors?.[0];
  const doc = readVdoc(t.meta);
  const location = t.location;
  const snippet = extractSnippet(location);
  return {
    kind: 'test',
    name: t.name,
    status: mapStatus(t),
    ...(t.result?.duration !== undefined && { duration: t.result.duration }),
    ...(doc !== undefined && { doc }),
    ...(location && { location }),
    ...(snippet && {
      snippet: snippet.snippet,
      snippetStartLine: snippet.startLine,
    }),
    ...(firstError && {
      error: {
        message: firstError.message,
        ...(firstError.stack !== undefined || firstError.stackStr !== undefined
          ? { stack: firstError.stack ?? firstError.stackStr }
          : {}),
        ...(firstError.expected !== undefined && {
          expected: stringifyValue(firstError.expected),
        }),
        ...(firstError.actual !== undefined && {
          actual: stringifyValue(firstError.actual),
        }),
      },
    }),
  };
};

/**
 * Given JS/TS source and the 1-based line of a call expression, return the
 * source slice from that line through the line containing the call's closing
 * paren, dedented to its common leading whitespace.
 *
 * Why: vitest reports the location of `it`/`test` calls; we want to show the
 * whole call (including the callback body) in the docs UI.
 */
const extractCallSnippet = (
  source: string,
  startLine: number,
): { snippet: string; startLine: number } | undefined => {
  const lines = source.split('\n');
  if (startLine < 1 || startLine > lines.length) return undefined;

  let lineNo = 1;
  let offset = 0;
  while (lineNo < startLine && offset < source.length) {
    if (source.charCodeAt(offset) === 10) lineNo += 1;
    offset += 1;
  }
  const lineStart = offset;

  // Scan forward to the first '(' at depth 0 of strings/comments.
  let i = lineStart;
  while (i < source.length && source[i] !== '(') {
    // Skip line until we find '(' — bail if we hit a newline twice (call not here).
    if (source[i] === '\n' && lineNo > startLine + 1) return undefined;
    if (source[i] === '\n') lineNo += 1;
    i += 1;
  }
  if (i >= source.length) return undefined;

  // Now do a brace/paren/quote-aware scan to find the matching ')'.
  // Stack tracks open parens and template-literal interpolations.
  let depth = 0;
  type Mode = 'code' | 'sq' | 'dq' | 'tpl' | 'line-cmt' | 'block-cmt';
  let mode: Mode = 'code';
  const tplDepthStack: number[] = []; // depth at which each `${ ` started
  let endLine = lineNo;

  for (; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '\n') endLine += 1;

    if (mode === 'line-cmt') {
      if (ch === '\n') mode = 'code';
      continue;
    }
    if (mode === 'block-cmt') {
      if (ch === '*' && next === '/') {
        mode = 'code';
        i += 1;
      }
      continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if ((mode === 'sq' && ch === "'") || (mode === 'dq' && ch === '"'))
        mode = 'code';
      continue;
    }
    if (mode === 'tpl') {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '`') mode = 'code';
      else if (ch === '$' && next === '{') {
        tplDepthStack.push(depth);
        mode = 'code';
        i += 1;
      }
      continue;
    }

    // mode === 'code'
    if (ch === '/' && next === '/') {
      mode = 'line-cmt';
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      mode = 'block-cmt';
      i += 1;
      continue;
    }
    if (ch === "'") {
      mode = 'sq';
      continue;
    }
    if (ch === '"') {
      mode = 'dq';
      continue;
    }
    if (ch === '`') {
      mode = 'tpl';
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    } else if (ch === '}' && tplDepthStack.length > 0) {
      const tplDepth = tplDepthStack[tplDepthStack.length - 1];
      if (depth === tplDepth) {
        tplDepthStack.pop();
        mode = 'tpl';
      }
    }
  }

  const slice = lines.slice(startLine - 1, endLine);
  // Dedent: find min leading whitespace among non-blank lines.
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of slice) {
    if (line.trim().length === 0) continue;
    const m = /^[\t ]*/.exec(line);
    const n = m ? m[0].length : 0;
    if (n < minIndent) minIndent = n;
  }
  if (!Number.isFinite(minIndent)) minIndent = 0;
  const dedented = slice
    .map((l) => (l.length >= minIndent ? l.slice(minIndent) : l))
    .join('\n');

  return { snippet: dedented, startLine };
};

const readFileIfExists = (path: string): string | undefined => {
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
};

const readDocSibling = (testFilePath: string): string | undefined => {
  const docPath = testFilePath.replace(
    /\.test\.(ts|tsx|js|jsx|mts|cts)$/,
    '.doc.md',
  );
  if (docPath === testFilePath) return undefined;
  return readFileIfExists(docPath);
};

// Walk every ancestor directory of each test file and pick up an
// `index.doc.md` if one is present. Returns folder docs keyed by their
// path relative to cwd — matching the directory portion of `FileNode.filepath`.
const collectFolderDocs = (files: VitestFile[], cwd: string): FolderDoc[] => {
  const seen = new Set<string>();
  const docs: FolderDoc[] = [];
  for (const file of files) {
    const segments = relative(cwd, file.filepath).split('/').filter(Boolean);
    segments.pop(); // drop filename
    let cur = '';
    for (const seg of segments) {
      cur = cur ? `${cur}/${seg}` : seg;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const doc = readFileIfExists(resolve(cwd, cur, 'index.doc.md'));
      if (doc !== undefined) docs.push({ path: cur, doc });
    }
  }
  return docs;
};

const readHomeMd = (rootDir: string): string | undefined => {
  const home = resolve(rootDir, 'home.md');
  if (existsSync(home)) return readFileIfExists(home);
  const readme = resolve(rootDir, '..', 'README.md');
  return readFileIfExists(readme);
};

const readPackageMeta = (cwd: string): PackageMeta => {
  const pkgPath = resolve(cwd, 'package.json');
  const raw = readFileIfExists(pkgPath);
  if (!raw) return { name: basename(cwd), version: '0.0.0' };
  try {
    const parsed = JSON.parse(raw) as Partial<PackageMeta>;
    return {
      name: parsed.name ?? basename(cwd),
      version: parsed.version ?? '0.0.0',
      ...(parsed.description !== undefined && {
        description: parsed.description,
      }),
    };
  } catch {
    return { name: basename(cwd), version: '0.0.0' };
  }
};

const buildSummary = (
  files: FileNode[],
  startedAt: number,
  finishedAt: number,
): ReportSummary => {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const visit = (node: SuiteNode | TestNode | FileNode): void => {
    if (node.kind === 'test') {
      total += 1;
      if (node.status === 'pass') passed += 1;
      else if (node.status === 'fail') failed += 1;
      else skipped += 1;
      return;
    }
    for (const child of node.children) visit(child);
  };
  for (const file of files) visit(file);
  return {
    total,
    passed,
    failed,
    skipped,
    durationMs: Math.max(0, finishedAt - startedAt),
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
  };
};

export class VTestReporter {
  private readonly outFile: string;
  private readonly root: string;
  private startedAt = 0;

  constructor(options: VTestReporterOptions = {}) {
    this.root = options.root ?? 'vtest';
    this.outFile = options.outFile ?? `${this.root}/report.json`;
  }

  onInit(): void {
    this.startedAt = Date.now();
  }

  onFinished(
    files: VitestFile[] = [],
    _errors: unknown[] = [],
    _coverage?: unknown,
  ): void {
    const finishedAt = Date.now();
    const cwd = process.cwd();
    const rootDir = resolve(cwd, this.root);

    const fileNodes: FileNode[] = files.map((file) => {
      const doc = readDocSibling(file.filepath);
      const source = readFileIfExists(file.filepath);
      const extract: SnippetExtractor = (loc) =>
        source && loc ? extractCallSnippet(source, loc.line) : undefined;
      return {
        kind: 'file',
        name: basename(file.filepath).replace(
          /\.test\.(ts|tsx|js|jsx|mts|cts)$/,
          '',
        ),
        filepath: relative(cwd, file.filepath),
        ...(doc !== undefined && { doc }),
        children: file.tasks.map((t) => convertTask(t, extract)),
      };
    });

    const home = readHomeMd(rootDir);
    const folders = collectFolderDocs(files, cwd);
    const report: VTestReport = {
      package: readPackageMeta(cwd),
      ...(home !== undefined && { home }),
      files: fileNodes,
      ...(folders.length > 0 && { folders }),
      summary: buildSummary(
        fileNodes,
        this.startedAt || finishedAt,
        finishedAt,
      ),
    };

    const target = resolve(cwd, this.outFile);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  }
}
