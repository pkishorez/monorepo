import { readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { type Directive, type Statement, parseSync } from 'oxc-parser';
import { ResolverFactory } from 'oxc-resolver';
import { type Export, exportsOf } from '../shared/contracts/index.ts';

/*
 * One project's files as the rules read them: each parsed once, and each
 * import resolved once, as TypeScript and Node resolve it on the disk:
 * relative paths, `.js` written for `.ts`, folder index files, tsconfig
 * `paths` (with `extends` and `references`), package.json `imports`
 * (`#name`), and a package naming itself. Only a file the project lists
 * is a target.
 */

/** A folder on disk, and the files in it to read. */
export interface Project {
  /** The folder, absolute. */
  readonly root: string;
  /** Its files, relative to `root`, `/` between folders. */
  readonly files: readonly string[];
  /** A file's text, when the disk is not where it is read from. */
  readonly read?: (file: string) => string | undefined;
}

/** One import a file makes. */
export interface Import {
  /** As written: `./part.ts`, `#lib/x`, `react`. */
  readonly specifier: string;
  /** The project file it names, relative to the root; absent when none does. */
  readonly target?: string;
  /** Where the specifier starts, both 1-based. */
  readonly line: number;
  readonly column: number;
}

/** The extensions of the files the rules read. */
export const sourceExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const;

/** Whether `file` is one the rules read: by its extension. */
export const isSource = (file: string): boolean =>
  sourceExtensions.some((extension) => file.endsWith(extension));

/** A file read and parsed. */
export interface Parsed {
  /** What it exports, as the contracts rule reads it. */
  readonly exports: readonly Export[];
  readonly imports: readonly Import[];
  /** The 1-based line and column of an offset in the file's text. */
  readonly at: (offset: number) => {
    readonly line: number;
    readonly column: number;
  };
}

/** A project's files, each read and parsed once, on first ask. */
export interface Sources {
  readonly files: ReadonlySet<string>;
  /** A file's text; undefined when it cannot be read. */
  readonly read: (file: string) => string | undefined;
  /** A source file read and parsed; undefined when it cannot be read. */
  readonly parse: (file: string) => Parsed | undefined;
}

/** The Sources of `project`, with one resolver for all of them. */
export const sourcesOf = (project: Project): Sources => {
  const files = new Set(project.files);
  const root = project.root;
  const read =
    project.read ??
    ((file: string) => {
      try {
        return readFileSync(join(root, file), 'utf8');
      } catch {
        return undefined;
      }
    });
  const options = {
    extensions: [...sourceExtensions, '.json'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    conditionNames: ['node', 'import'],
  };
  const resolver = new ResolverFactory({ ...options, tsconfig: 'auto' });
  // A tsconfig that cannot be read, such as one extending a package not
  // installed, fails every import below it; those are followed without it.
  const plain = new ResolverFactory(options);
  // The resolver answers with real paths, so the root is read as one too.
  const real = realRoot(root);
  const target = (file: string, specifier: string): string | undefined => {
    const from = join(real, file);
    const path =
      resolver.resolveFileSync(from, specifier).path ??
      plain.resolveFileSync(from, specifier).path;
    if (path === undefined) return undefined;
    const found = relative(real, path).split(sep).join('/');
    return files.has(found) ? found : undefined;
  };

  const parsed = new Map<string, Parsed | undefined>();
  return {
    files,
    read,
    parse: (file: string): Parsed | undefined => {
      if (parsed.has(file)) return parsed.get(file);
      const text = isSource(file) ? read(file) : undefined;
      const result = text === undefined ? undefined : parse(file, text, target);
      parsed.set(file, result);
      return result;
    },
  };
};

const realRoot = (root: string): string => {
  try {
    return realpathSync.native(root);
  } catch {
    return root;
  }
};

const parse = (
  file: string,
  text: string,
  target: (file: string, specifier: string) => string | undefined,
): Parsed => {
  const { program, module } = parseSync(file, text);
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1))
    starts.push(i + 1);
  const at = (offset: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: offset - (starts[low] ?? 0) + 1 };
  };

  // Each statement counts once, however many names it brings, and
  // `export {} from './x'`, which brings none, counts too, as do those
  // inside `declare module '…' {}`, `declare global {}` and namespaces.
  const requests: Array<{
    readonly specifier: string;
    readonly start: number;
  }> = [];
  const collect = (body: ReadonlyArray<Directive | Statement>): void => {
    for (const statement of body) {
      const declared =
        statement.type === 'ExportNamedDeclaration'
          ? statement.declaration
          : statement;
      if (declared?.type === 'TSModuleDeclaration' && declared.body)
        collect(declared.body.body);
      if (
        statement.type === 'ImportDeclaration' ||
        statement.type === 'ExportAllDeclaration' ||
        statement.type === 'ExportNamedDeclaration'
      ) {
        const { source } = statement;
        if (source)
          requests.push({ specifier: source.value, start: source.start });
      }
    }
  };
  collect(program.body);
  for (const { moduleRequest } of module.dynamicImports) {
    const specifier = literalOf(
      text.slice(moduleRequest.start, moduleRequest.end),
    );
    if (specifier !== undefined)
      requests.push({ specifier, start: moduleRequest.start });
  }
  requests.sort((a, b) => a.start - b.start);

  const imports = requests.map(({ specifier, start }): Import => {
    const to = target(file, specifier);
    return {
      specifier,
      ...(to === undefined ? {} : { target: to }),
      ...at(start),
    };
  });
  return { imports, exports: exportsOf(program), at };
};

/**
 * The text an `import()` argument holds when it is one string literal,
 * or a template literal with no `${}`: `'./a.ts'`, not `'./a/' + n`.
 */
const literalOf = (argument: string): string | undefined => {
  if (!/^['"`]/.test(argument)) return undefined;
  const [statement] = parseSync('argument.js', `(${argument});`, {
    preserveParens: false,
  }).program.body;
  if (statement?.type !== 'ExpressionStatement') return undefined;
  const { expression } = statement;
  if (expression.type === 'Literal' && typeof expression.value === 'string')
    return expression.value;
  if (
    expression.type === 'TemplateLiteral' &&
    expression.expressions.length === 0
  )
    return expression.quasis[0]?.value.cooked ?? undefined;
  return undefined;
};
