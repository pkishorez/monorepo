import { Lang, parse } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import { Data, Effect, FileSystem, Path } from 'effect';

const storyModule = 'laymos/story';
const storyFilePattern = /\.story\.[cm]?[jt]sx?$/;
const sourceFileGlob = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const excludedSourceGlobs = [
  '**/node_modules/**',
  '**/dist/**',
  '**/test/fixtures/**',
  '**/__fixtures__/**',
  '**/.*',
];
const ejectableNames = new Set([
  'all',
  'decision',
  'exhaustive',
  'flow',
  'forEach',
  'omit',
  'orElse',
  'step',
  'terminal',
  'when',
]);

type StoryExport =
  | 'all'
  | 'decision'
  | 'exhaustive'
  | 'flow'
  | 'forEach'
  | 'omit'
  | 'orElse'
  | 'step'
  | 'terminal'
  | 'when';

interface ImportBinding {
  readonly exported: StoryExport;
  readonly local: string;
  readonly statement: SgNode;
}

interface NamespaceBinding {
  readonly local: string;
  readonly statement: SgNode;
}

interface SourceAnalysis {
  readonly bindings: ReadonlyMap<string, ImportBinding>;
  readonly namespaces: ReadonlyMap<string, NamespaceBinding>;
  readonly storyImports: readonly SgNode[];
  readonly unsupported: readonly string[];
  readonly effectName: string;
  readonly hasEffectImport: boolean;
  readonly matchName: string;
  readonly hasMatchImport: boolean;
}

interface ProjectionContext {
  readonly tokensByNodeId: ReadonlyMap<number, readonly string[]>;
  readonly provenanceByToken: ReadonlyMap<string, StorySourceProvenance>;
}

export type StorySourceClassification = 'narrated' | 'omitted' | 'unnarrated';

export interface StorySourceProvenance {
  readonly id: string;
  readonly classification: Exclude<StorySourceClassification, 'unnarrated'>;
  readonly reason?: string;
}

export interface StoryEjectionRewrite {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

export interface StoryEjectionPlan {
  readonly rewrites: readonly StoryEjectionRewrite[];
  readonly deletions: readonly string[];
}

export interface StoryEjectionResult {
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
  readonly dryRun: boolean;
}

export interface StorySourceAnchor {
  readonly id: string;
  readonly line: number;
  readonly column: number;
  readonly classification?: Exclude<StorySourceClassification, 'unnarrated'>;
  readonly reason?: string;
}

export interface StorySourceProjectionRange {
  readonly id: string;
  readonly classification: StorySourceClassification;
  readonly reason?: string;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface StorySourceProjection {
  readonly content: string;
  readonly ranges: readonly StorySourceProjectionRange[];
}

export interface StorySourceProjections {
  readonly ejected: StorySourceProjection;
  readonly clean: StorySourceProjection;
}

export type StoryDecisionRole = 'value' | 'control-flow';

export interface StoryDecisionSourceRole {
  readonly line: number;
  readonly column: number;
  readonly role: StoryDecisionRole;
}

export class StoryEjectionError extends Data.TaggedError('StoryEjectionError')<{
  readonly message: string;
}> {}

export class StoryAuthoringError extends Data.TaggedError(
  'StoryAuthoringError',
)<{
  readonly message: string;
  readonly issues: readonly string[];
}> {}

class TransformError extends Error {}

export function transformStorySource(source: string, fileName: string): string {
  if (!source.includes(storyModule)) return source;
  return transformSource(source, fileName);
}

/** Build read-only source views while retaining each Story node's provenance. */
export function projectStorySource(
  source: string,
  fileName: string,
  anchors: readonly StorySourceAnchor[],
): StorySourceProjections {
  const root = parse(languageFor(fileName), source).root();
  assertValidSyntax(root, fileName);
  const analysis = analyzeSource(root, fileName);
  validateAuthoring(root, analysis, fileName);
  const projection = projectionContext(root, analysis, anchors);
  const marked = transformSource(source, fileName, anchors);
  return {
    ejected: extractProjection(marked, projection),
    clean: extractProjection(
      cleanProjectedSource(marked, fileName),
      projection,
    ),
  };
}

function transformSource(
  source: string,
  fileName: string,
  anchors: readonly StorySourceAnchor[] = [],
  verifyIdempotence = true,
): string {
  const root = parse(languageFor(fileName), source).root();
  assertValidSyntax(root, fileName);
  const analysis = analyzeSource(root, fileName);
  if (analysis.unsupported.length > 0) {
    throw new TransformError(analysis.unsupported.join('\n'));
  }
  validateAuthoring(root, analysis, fileName);
  const projection = projectionContext(root, analysis, anchors);
  const transformed = renderNode(root, analysis, projection);
  const output = ensureNativeImports(transformed, fileName, analysis);
  const verifiedRoot = parse(languageFor(fileName), output).root();
  assertValidSyntax(verifiedRoot, fileName);
  const remaining = analyzeSource(verifiedRoot, fileName);
  const remainingCall = verifiedRoot
    .findAll(byKind('call_expression'))
    .find(
      (call) =>
        importedCall(call, remaining.bindings, remaining.namespaces) !==
        undefined,
    );
  if (
    remaining.bindings.size > 0 ||
    remaining.namespaces.size > 0 ||
    remainingCall !== undefined
  ) {
    throw new TransformError(
      `${fileName}: Story ejection left ejectable imports behind`,
    );
  }
  if (
    verifyIdempotence &&
    transformSource(output, fileName, [], false) !== output
  ) {
    throw new TransformError(`${fileName}: Story ejection is not idempotent`);
  }
  return output;
}

/** Validate that Story authoring can be erased into idiomatic application code. */
export function validateStoryAuthoringSource(
  source: string,
  fileName: string,
): readonly string[] {
  if (!source.includes(storyModule)) return [];
  try {
    const root = parse(languageFor(fileName), source).root();
    assertValidSyntax(root, fileName);
    const analysis = analyzeSource(root, fileName);
    validateAuthoring(root, analysis, fileName);
    return analysis.unsupported;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

/** Classify Decision expressions by how their result is used. */
export function storyDecisionSourceRoles(
  source: string,
  fileName: string,
): readonly StoryDecisionSourceRole[] {
  if (!source.includes(storyModule)) return [];
  const root = parse(languageFor(fileName), source).root();
  assertValidSyntax(root, fileName);
  const analysis = analyzeSource(root, fileName);
  const roles = new Map<number, StoryDecisionSourceRole>();
  for (const call of root.findAll(byKind('call_expression'))) {
    const parsed = decisionPipe(call, analysis, fileName);
    if (parsed === undefined) continue;
    const { line, column } = parsed.decision.range().start;
    roles.set(parsed.decision.id(), {
      line: line + 1,
      column: column + 1,
      role: parsed.role,
    });
  }
  return [...roles.values()];
}

/** Validate every authored Story construct in a project without changing files. */
export function validateProjectStoryAuthoring(
  baseDir: string,
): Effect.Effect<void, StoryAuthoringError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = yield* fs.glob(sourceFileGlob, {
      root: baseDir,
      exclude: excludedSourceGlobs,
    });
    files.sort();
    const issues = (yield* Effect.forEach(
      files,
      (relativePath) =>
        fs
          .readFileString(path.join(baseDir, relativePath))
          .pipe(
            Effect.map((source) =>
              validateStoryAuthoringSource(source, relativePath),
            ),
          ),
      { concurrency: 16 },
    )).flat();
    if (issues.length > 0) {
      return yield* new StoryAuthoringError({
        message: `Story authoring validation failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
        issues,
      });
    }
  }).pipe(
    Effect.mapError((error) =>
      error instanceof StoryAuthoringError
        ? error
        : new StoryAuthoringError({
            message: String(error),
            issues: [String(error)],
          }),
    ),
  );
}

export function isLaymosStoryFile(source: string, fileName: string): boolean {
  if (!storyFilePattern.test(fileName) || !source.includes(storyModule)) {
    return false;
  }
  const root = parse(languageFor(fileName), source).root();
  assertValidSyntax(root, fileName);
  return importsFrom(root, storyModule).length > 0;
}

export function planStoryEjection(
  baseDir: string,
): Effect.Effect<
  StoryEjectionPlan,
  StoryEjectionError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = yield* fs.glob(sourceFileGlob, {
      root: baseDir,
      exclude: excludedSourceGlobs,
    });
    files.sort();

    const analyzed = yield* Effect.forEach(
      files,
      (relativePath) =>
        fs
          .readFileString(path.join(baseDir, relativePath))
          .pipe(Effect.map((source) => ({ relativePath, source }))),
      { concurrency: 16 },
    );

    const rewrites: StoryEjectionRewrite[] = [];
    const deletions: string[] = [];
    const issues: string[] = [];

    for (const { relativePath, source } of analyzed) {
      if (!source.includes(storyModule)) continue;
      try {
        if (isLaymosStoryFile(source, relativePath)) {
          deletions.push(relativePath);
          continue;
        }
        const after = transformStorySource(source, relativePath);
        if (after !== source) {
          rewrites.push({ path: relativePath, before: source, after });
        }
      } catch (error) {
        issues.push(
          error instanceof Error
            ? error.message
            : `${relativePath}: ${String(error)}`,
        );
      }
    }

    if (issues.length > 0) {
      return yield* new StoryEjectionError({
        message: `Story ejection preflight failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
      });
    }

    return { rewrites, deletions };
  }).pipe(
    Effect.mapError((error) =>
      error instanceof StoryEjectionError
        ? error
        : new StoryEjectionError({ message: String(error) }),
    ),
  );
}

export function ejectStories(
  baseDir: string,
  options: { readonly dryRun?: boolean } = {},
): Effect.Effect<
  StoryEjectionResult,
  StoryEjectionError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function* () {
    const plan = yield* planStoryEjection(baseDir);
    if (options.dryRun === true) {
      return {
        changed: plan.rewrites.map(({ path }) => path),
        deleted: plan.deletions,
        dryRun: true,
      };
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const written: StoryEjectionRewrite[] = [];
    const removed: Array<{
      readonly path: string;
      readonly content: string;
      readonly mode: number;
    }> = [];
    const deletionBackups = yield* Effect.forEach(
      plan.deletions,
      (relativePath) => {
        const target = path.join(baseDir, relativePath);
        return Effect.all([fs.readFileString(target), fs.stat(target)]).pipe(
          Effect.map(([content, info]) => ({
            path: relativePath,
            content,
            mode: info.mode,
          })),
        );
      },
      { concurrency: 16 },
    );

    const writeAll = Effect.gen(function* () {
      for (const rewrite of plan.rewrites) {
        yield* writeAtomically(
          fs,
          path,
          path.join(baseDir, rewrite.path),
          rewrite.after,
        );
        written.push(rewrite);
      }
      for (const backup of deletionBackups) {
        yield* fs.remove(path.join(baseDir, backup.path));
        removed.push(backup);
      }
    });

    yield* writeAll.pipe(
      Effect.catch((cause) =>
        Effect.all(
          [
            restoreRewrites(fs, path, baseDir, written),
            restoreRemovedStories(fs, path, baseDir, removed),
          ],
          { discard: true },
        ).pipe(
          Effect.andThen(
            Effect.fail(
              new StoryEjectionError({
                message: `Story ejection could not apply source changes: ${String(cause)}`,
              }),
            ),
          ),
        ),
      ),
    );

    return {
      changed: plan.rewrites.map(({ path }) => path),
      deleted: plan.deletions,
      dryRun: false,
    };
  }).pipe(
    Effect.mapError((error) =>
      error instanceof StoryEjectionError
        ? error
        : new StoryEjectionError({ message: String(error) }),
    ),
  );
}

function analyzeSource(root: SgNode, fileName: string): SourceAnalysis {
  const bindings = new Map<string, ImportBinding>();
  const namespaces = new Map<string, NamespaceBinding>();
  const storyImports = importsFrom(root, storyModule);
  const unsupported: string[] = [];

  for (const statement of storyImports) {
    const clause = importClause(statement);
    const named = clause?.find(byKind('named_imports'));
    const namespace = clause?.find(byKind('namespace_import'));
    const defaultImport = clause
      ?.children()
      .find((child) => child.kind() === 'identifier');

    if (defaultImport !== undefined) {
      unsupported.push(
        diagnostic(
          fileName,
          defaultImport,
          'default imports are not supported',
        ),
      );
    }

    if (named !== null && named !== undefined) {
      for (const specifier of named.findAll(byKind('import_specifier'))) {
        const identifiers = specifier
          .children()
          .filter((child) => child.kind() === 'identifier');
        const exported = identifiers[0]?.text();
        const local = identifiers.at(-1)?.text();
        if (
          exported !== undefined &&
          local !== undefined &&
          ejectableNames.has(exported) &&
          !specifier.text().trimStart().startsWith('type ')
        ) {
          bindings.set(local, {
            exported: exported as StoryExport,
            local,
            statement,
          });
        }
      }
    }

    if (namespace !== null && namespace !== undefined) {
      const local = namespace.findAll(byKind('identifier')).at(-1)?.text();
      if (local !== undefined) {
        namespaces.set(local, { local, statement });
        const retainedMember = root
          .findAll(byKind('member_expression'))
          .find(
            (member) =>
              field(member, 'object')?.text() === local &&
              field(member, 'property') !== null &&
              !ejectableNames.has(field(member, 'property')!.text()),
          );
        if (retainedMember !== undefined) {
          unsupported.push(
            diagnostic(
              fileName,
              retainedMember,
              'Story namespace imports cannot mix ejectable and retained exports; use named imports',
            ),
          );
        }
      }
    }
  }

  for (const statement of root.findAll(byKind('export_statement'))) {
    if (moduleSource(statement) !== storyModule) continue;
    if (
      [...ejectableNames].some((name) =>
        statement
          .findAll(byKind('identifier'))
          .some((node) => node.text() === name),
      )
    ) {
      unsupported.push(
        diagnostic(fileName, statement, 're-exports are not supported'),
      );
    }
  }

  for (const call of root.findAll(byKind('call_expression'))) {
    const callee = field(call, 'function');
    if (callee?.kind() !== 'import') continue;
    const args = callArguments(call);
    if (args[0] !== undefined && stringValue(args[0]) === storyModule) {
      unsupported.push(
        diagnostic(fileName, call, 'dynamic imports are not supported'),
      );
    }
  }

  const importNodeIds = new Set<number>();
  for (const statement of storyImports) {
    for (const node of statement.findAll(byKind('identifier'))) {
      importNodeIds.add(node.id());
    }
  }

  for (const identifier of root.findAll(byKind('identifier'))) {
    if (importNodeIds.has(identifier.id())) continue;
    const binding = bindings.get(identifier.text());
    if (
      binding !== undefined &&
      !isAllowedImportedReference(
        identifier,
        binding.exported,
        bindings,
        namespaces,
      )
    ) {
      unsupported.push(
        diagnostic(
          fileName,
          identifier,
          `the imported ${binding.exported} binding escapes a direct call`,
        ),
      );
    }
    const namespaceBinding = namespaces.get(identifier.text());
    if (
      namespaceBinding !== undefined &&
      !isAllowedNamespaceReference(identifier, bindings, namespaces)
    ) {
      unsupported.push(
        diagnostic(
          fileName,
          identifier,
          `the ${namespaceBinding.local} namespace escapes a direct member call`,
        ),
      );
    }
  }

  const effectImport = findNamedEffectImport(root, 'Effect');
  const matchImport = findNamedEffectImport(root, 'Match');
  const occupied = new Set(
    root
      .findAll(byKind('identifier'))
      .filter((node) => !isAliasedImportSource(node))
      .map((node) => node.text()),
  );
  const effectName = effectImport?.local ?? freshNativeName('Effect', occupied);
  occupied.add(effectName);
  const matchName = matchImport?.local ?? freshNativeName('Match', occupied);

  return {
    bindings,
    namespaces,
    storyImports,
    unsupported: [...new Set(unsupported)],
    effectName,
    hasEffectImport: effectImport !== undefined,
    matchName,
    hasMatchImport: matchImport !== undefined,
  };
}

function validateAuthoring(
  root: SgNode,
  analysis: SourceAnalysis,
  fileName: string,
): void {
  if (analysis.unsupported.length > 0) {
    throw new TransformError(analysis.unsupported.join('\n'));
  }

  const ownedCalls = new Set<number>();
  const ownedReferences = new Set<number>();
  for (const call of root.findAll(byKind('call_expression'))) {
    const parsed = decisionPipe(call, analysis, fileName);
    if (parsed === undefined) continue;
    validateDecisionPipe(parsed, fileName);
    ownedCalls.add(parsed.decision.id());
    for (const operator of parsed.operators) {
      if (operator.node.kind() === 'call_expression') {
        ownedCalls.add(operator.node.id());
      } else {
        ownedReferences.add(operator.node.id());
      }
    }
  }

  for (const call of root.findAll(byKind('call_expression'))) {
    const target = importedCall(call, analysis.bindings, analysis.namespaces);
    if (target === undefined || ownedCalls.has(call.id())) continue;
    const args = callArguments(call);
    if (target === 'flow') {
      requireArityAt(fileName, call, target, args, 3);
      if (!isFunction(args[2]!)) {
        invalid(
          fileName,
          args[2]!,
          'flow expects an Effect-returning function as its third argument',
        );
      }
      if (!isDirectFlowBinding(call)) {
        invalid(
          fileName,
          call,
          'flow must be assigned directly to a named variable or property and cannot be invoked immediately',
        );
      }
      continue;
    }
    if (target === 'step' || target === 'terminal') {
      requireArityAt(fileName, call, target, args, 3);
      requireConciseZeroArgumentArrow(fileName, args[2]!, target);
      requireStaticallyOpaque(fileName, args[2]!, target, analysis);
      continue;
    }
    if (target === 'omit') {
      requireArityAt(fileName, call, target, args, 2);
      requireOmissionReason(fileName, args[0]!);
      requireConciseZeroArgumentArrow(fileName, args[1]!, target);
      requireStaticallyOpaque(fileName, args[1]!, target, analysis);
      continue;
    }
    if (target === 'all' || target === 'forEach') continue;
    invalid(
      fileName,
      call,
      `${target} must be used inside one Match-shaped Decision pipe`,
    );
  }

  for (const reference of storyReferences(root, analysis)) {
    if (
      reference.exported !== 'exhaustive' ||
      ownedReferences.has(reference.node.id())
    ) {
      continue;
    }
    invalid(
      fileName,
      reference.node,
      'exhaustive must be the final operator in one Match-shaped Decision pipe',
    );
  }
  validateNarratedBranching(root, analysis, fileName);
}

function validateNarratedBranching(
  root: SgNode,
  analysis: SourceAnalysis,
  fileName: string,
): void {
  const narrativeBodies: SgNode[] = [];
  const opaqueBodies: SgNode[] = [];
  const decisionValues: SgNode[] = [];
  for (const call of root.findAll(byKind('call_expression'))) {
    const target = importedCall(call, analysis.bindings, analysis.namespaces);
    if (target === 'flow') {
      const body = field(callArguments(call)[2]!, 'body');
      if (body !== null) narrativeBodies.push(body);
      continue;
    }
    if (target === 'step' || target === 'terminal' || target === 'omit') {
      const body = field(callArguments(call).at(-1)!, 'body');
      if (body !== null) opaqueBodies.push(body);
    }
  }
  for (const call of root.findAll(byKind('call_expression'))) {
    const parsed = decisionPipe(call, analysis, fileName);
    if (parsed === undefined) continue;
    decisionValues.push(parsed.value);
    for (const operator of parsed.operators) {
      if (operator.target === 'exhaustive') continue;
      const body = field(operator.args.at(-1)!, 'body');
      if (body !== null) narrativeBodies.push(body);
    }
  }
  const branches = [
    ...root.findAll(byKind('if_statement')),
    ...root.findAll(byKind('switch_statement')),
    ...root.findAll(byKind('ternary_expression')),
  ];
  for (const branch of branches) {
    if (!narrativeBodies.some((body) => containsNode(body, branch))) continue;
    if (opaqueBodies.some((body) => containsNode(body, branch))) continue;
    if (decisionValues.some((value) => containsNode(value, branch))) continue;
    const argumentsNode = branch.parent();
    const decisionCall = argumentsNode?.parent();
    if (
      argumentsNode?.kind() === 'arguments' &&
      decisionCall?.kind() === 'call_expression' &&
      importedCall(decisionCall, analysis.bindings, analysis.namespaces) ===
        'decision'
    ) {
      continue;
    }
    invalid(
      fileName,
      branch,
      'Native branching inside a narrated Flow or Arm must be expressed as a Decision or kept inside an opaque Step or Omission',
    );
  }
}

function containsNode(container: SgNode, node: SgNode): boolean {
  const outer = container.range();
  const inner = node.range();
  return (
    outer.start.index <= inner.start.index && outer.end.index >= inner.end.index
  );
}

function requireStaticallyOpaque(
  fileName: string,
  operation: SgNode,
  subject: 'step' | 'terminal' | 'omit',
  analysis: SourceAnalysis,
): void {
  const nested = operation
    .findAll(byKind('call_expression'))
    .find(
      (call) =>
        importedCall(call, analysis.bindings, analysis.namespaces) !==
        undefined,
    );
  if (nested === undefined) return;
  invalid(
    fileName,
    nested,
    `${subject} is opaque and cannot contain another Story construct; extract nested narrative to a flow`,
  );
}

function validateDecisionPipe(decision: DecisionPipe, fileName: string): void {
  if (decision.operators.length === 0) {
    invalid(
      fileName,
      decision.node,
      'Decision pipes must declare at least one Arm and one endpoint',
    );
  }
  const endpoints = decision.operators.filter(
    ({ target }) => target === 'orElse' || target === 'exhaustive',
  );
  if (endpoints.length !== 1) {
    invalid(
      fileName,
      decision.node,
      'Decision pipes must end with exactly one orElse(...) or exhaustive endpoint',
    );
  }
  const endpoint = endpoints[0]!;
  if (decision.operators.at(-1)?.node.id() !== endpoint.node.id()) {
    invalid(fileName, endpoint.node, 'the Decision endpoint must be last');
  }
  if (!decision.operators.some(({ target }) => target === 'when')) {
    invalid(
      fileName,
      decision.node,
      'Decision pipes must declare at least one when(...) Arm',
    );
  }
  for (const operator of decision.operators) {
    if (operator.target === 'exhaustive') {
      if (operator.node.kind() === 'call_expression') {
        invalid(
          fileName,
          operator.node,
          'exhaustive is a pipe operator and must not be called',
        );
      }
      continue;
    }
    if (operator.node.kind() !== 'call_expression') {
      invalid(fileName, operator.node, `${operator.target} must be called`);
    }
    const arity = operator.target === 'when' ? 3 : 2;
    requireArityAt(
      fileName,
      operator.node,
      operator.target,
      operator.args,
      arity,
    );
    if (operator.target === 'when' && !isDecisionKey(operator.args[0]!)) {
      invalid(
        fileName,
        operator.args[0]!,
        'when patterns must be strings, finite numbers, booleans, or null',
      );
    }
    requireConciseZeroArgumentArrow(
      fileName,
      operator.args.at(-1)!,
      `Decision ${operator.target} Arm`,
    );
    const meta = operator.args.at(-2)!;
    if (decision.role === 'value' && objectHasProperty(meta, 'completion')) {
      invalid(
        fileName,
        meta,
        'Arms of assigned Decisions cannot declare completion',
      );
    }
    if (
      objectHasProperty(meta, 'completion') &&
      objectHasProperty(meta, 'errors')
    ) {
      invalid(
        fileName,
        meta,
        'Decision Arms cannot declare both errors and completion',
      );
    }
  }
}

function objectHasProperty(node: SgNode, property: string): boolean {
  const object = unwrapExpression(node);
  if (object.kind() !== 'object') return false;
  return object.children().some((child) => {
    if (child.kind() === 'shorthand_property_identifier') {
      return child.text() === property;
    }
    if (child.kind() !== 'pair') return false;
    const key = field(child, 'key');
    return key !== null && (stringValue(key) ?? key.text()) === property;
  });
}

function requireArityAt(
  fileName: string,
  node: SgNode,
  subject: string,
  args: readonly SgNode[],
  expected: number,
): void {
  if (args.length !== expected) {
    invalid(
      fileName,
      node,
      `${subject} expects ${expected} argument${expected === 1 ? '' : 's'}`,
    );
  }
}

function requireConciseZeroArgumentArrow(
  fileName: string,
  node: SgNode,
  subject: string,
): void {
  if (node.kind() !== 'arrow_function') {
    invalid(
      fileName,
      node,
      `${subject} operation must be a zero-argument concise arrow`,
    );
  }
  const parameters = field(node, 'parameters');
  const body = field(node, 'body');
  const parameterNodes =
    parameters?.children().filter((child) => child.isNamed()) ?? [];
  if (parameterNodes.length > 0 || body?.kind() === 'statement_block') {
    invalid(
      fileName,
      node,
      `${subject} operation must be a zero-argument concise arrow with one Effect expression`,
    );
  }
}

function renderConciseArrowBody(
  operation: SgNode,
  analysis: SourceAnalysis,
  projection: ProjectionContext,
): string {
  const body = field(operation, 'body');
  if (body === null) {
    throw new TransformError('A concise arrow operation has no body');
  }
  return renderNode(body, analysis, projection);
}

function requireOmissionReason(fileName: string, meta: SgNode): void {
  const object = unwrapExpression(meta);
  if (object.kind() !== 'object') {
    invalid(
      fileName,
      meta,
      'omit expects structured metadata with a non-empty reason',
    );
  }
  const reason = object
    .children()
    .find(
      (child) =>
        (child.kind() === 'pair' &&
          field(child, 'key') !== null &&
          (stringValue(field(child, 'key')!) ?? field(child, 'key')!.text()) ===
            'reason') ||
        (child.kind() === 'shorthand_property_identifier' &&
          child.text() === 'reason'),
    );
  if (reason === undefined) {
    invalid(fileName, meta, 'omit metadata requires a reason');
  }
  const value = reason.kind() === 'pair' ? field(reason, 'value') : null;
  if (value !== null && stringValue(value)?.trim() === '') {
    invalid(fileName, value, 'omit reason must not be empty');
  }
}

function unwrapExpression(node: SgNode): SgNode {
  let current = node;
  while (
    current.kind() === 'parenthesized_expression' ||
    current.kind() === 'as_expression' ||
    current.kind() === 'satisfies_expression'
  ) {
    const next = current.children().find((child) => child.isNamed());
    if (next === undefined) return current;
    current = next;
  }
  return current;
}

function isDirectFlowBinding(call: SgNode): boolean {
  let value = call;
  let parent = value.parent();
  while (
    parent !== null &&
    (parent.kind() === 'parenthesized_expression' ||
      parent.kind() === 'as_expression' ||
      parent.kind() === 'satisfies_expression')
  ) {
    value = parent;
    parent = value.parent();
  }
  if (parent === null) return false;
  if (parent.kind() === 'variable_declarator') {
    return (
      field(parent, 'value')?.id() === value.id() &&
      field(parent, 'name')?.kind() === 'identifier'
    );
  }
  if (parent.kind() === 'public_field_definition') {
    return field(parent, 'value')?.id() === value.id();
  }
  if (parent.kind() === 'pair') {
    return field(parent, 'value')?.id() === value.id();
  }
  if (parent.kind() === 'assignment_expression') {
    return field(parent, 'right')?.id() === value.id();
  }
  return false;
}

function invalid(fileName: string, node: SgNode, message: string): never {
  throw new TransformError(diagnostic(fileName, node, message));
}

function renderNode(
  node: SgNode,
  analysis: SourceAnalysis,
  projection: ProjectionContext,
): string {
  if (node.kind() === 'call_expression') {
    const decision = decisionPipe(node, analysis);
    if (decision !== undefined) {
      return renderDecision(decision, analysis, projection);
    }

    const target = importedCall(node, analysis.bindings, analysis.namespaces);
    if (target !== undefined) {
      const args = callArguments(node);
      if (
        target === 'decision' ||
        target === 'when' ||
        target === 'orElse' ||
        target === 'exhaustive'
      ) {
        throw new TransformError(
          diagnostic(
            'source',
            node,
            `${target} must be used in one Match-shaped Decision pipe`,
          ),
        );
      }
      return markRendered(
        node,
        renderSimpleCall(target, node, args, analysis, projection),
        projection,
      );
    }
  }

  if (
    node.kind() === 'import_statement' &&
    analysis.storyImports.some((item) => item.id() === node.id())
  ) {
    return renderStoryImport(node);
  }

  const edits = node.children().flatMap((child) => {
    const rendered = renderNode(child, analysis, projection);
    return rendered === child.text() ? [] : [child.replace(rendered)];
  });
  const rendered = edits.length === 0 ? node.text() : node.commitEdits(edits);
  return node.kind() === 'call_expression'
    ? markRendered(node, rendered, projection)
    : rendered;
}

function renderSimpleCall(
  target: 'all' | 'flow' | 'forEach' | 'omit' | 'step' | 'terminal',
  call: SgNode,
  args: readonly SgNode[],
  analysis: SourceAnalysis,
  projection: ProjectionContext,
): string {
  if (target === 'flow') {
    requireArity(target, args, 3);
    return renderNode(args[2]!, analysis, projection);
  }
  if (target === 'step' || target === 'terminal') {
    requireArity(target, args, 3);
    return renderConciseArrowBody(args[2]!, analysis, projection);
  }
  if (target === 'omit') {
    requireArity(target, args, 2);
    return renderConciseArrowBody(args[1]!, analysis, projection);
  }
  const callArgs = field(call, 'arguments');
  if (callArgs === null) {
    throw new TransformError(`${target} has no argument list`);
  }
  const renderedArgs = renderNode(callArgs, analysis, projection);
  return `${analysis.effectName}.${target}${renderedArgs}`;
}

interface DecisionOperator {
  readonly node: SgNode;
  readonly target: 'when' | 'orElse' | 'exhaustive';
  readonly args: readonly SgNode[];
}

interface DecisionPipe {
  readonly node: SgNode;
  readonly decision: SgNode;
  readonly value: SgNode;
  readonly operators: readonly DecisionOperator[];
  readonly role: StoryDecisionRole;
}

function decisionPipe(
  pipe: SgNode,
  analysis: SourceAnalysis,
  fileName = 'source',
): DecisionPipe | undefined {
  const callee = field(pipe, 'function');
  if (
    callee?.kind() !== 'member_expression' ||
    field(callee, 'property')?.text() !== 'pipe'
  ) {
    return undefined;
  }
  const decision = field(callee, 'object');
  if (
    decision?.kind() !== 'call_expression' ||
    importedCall(decision, analysis.bindings, analysis.namespaces) !==
      'decision'
  ) {
    return undefined;
  }
  const decisionArgs = callArguments(decision);
  requireArityAt(fileName, decision, 'decision', decisionArgs, 3);
  const operators = callArguments(pipe).map((node): DecisionOperator => {
    const target = importedStoryReference(
      node.kind() === 'call_expression' ? field(node, 'function') : node,
      analysis.bindings,
      analysis.namespaces,
    );
    if (target !== 'when' && target !== 'orElse' && target !== 'exhaustive') {
      throw new TransformError(
        diagnostic(
          fileName,
          node,
          'Decision pipes accept only when(...), orElse(...), and exhaustive',
        ),
      );
    }
    return {
      node,
      target,
      args: node.kind() === 'call_expression' ? callArguments(node) : [],
    };
  });
  return {
    node: pipe,
    decision,
    value: decisionArgs[2]!,
    operators,
    role: decisionRole(pipe, fileName),
  };
}

function decisionRole(pipe: SgNode, fileName: string): StoryDecisionRole {
  let value = upwardExpression(pipe);
  let parent = value.parent();
  if (parent?.kind() === 'yield_expression') {
    value = upwardExpression(parent);
    parent = value.parent();
    if (
      parent?.kind() === 'variable_declarator' &&
      field(parent, 'value')?.id() === value.id()
    ) {
      return 'value';
    }
  }
  if (
    parent?.kind() === 'return_statement' ||
    (parent?.kind() === 'arrow_function' &&
      field(parent, 'body')?.id() === value.id()) ||
    (parent?.kind() === 'variable_declarator' &&
      field(parent, 'value')?.id() === value.id())
  ) {
    return 'control-flow';
  }
  invalid(
    fileName,
    pipe,
    'Decision results must be assigned with yield* or returned directly',
  );
}

function upwardExpression(node: SgNode): SgNode {
  let current = node;
  let parent = current.parent();
  while (
    parent !== null &&
    (parent.kind() === 'parenthesized_expression' ||
      parent.kind() === 'as_expression' ||
      parent.kind() === 'satisfies_expression')
  ) {
    current = parent;
    parent = current.parent();
  }
  return current;
}

function isDecisionKey(node: SgNode): boolean {
  if (
    node.kind() === 'string' ||
    node.kind() === 'true' ||
    node.kind() === 'false' ||
    node.kind() === 'null'
  ) {
    return true;
  }
  if (node.kind() === 'number') {
    return Number.isFinite(Number(node.text().replaceAll('_', '')));
  }
  if (node.kind() !== 'unary_expression') return false;
  const value = node
    .children()
    .find((child) => child.isNamed() && child.kind() === 'number');
  return (
    value !== undefined &&
    /^[+-]/.test(node.text()) &&
    Number.isFinite(Number(node.text().replaceAll('_', '')))
  );
}

function renderDecision(
  decision: DecisionPipe,
  analysis: SourceAnalysis,
  projection: ProjectionContext,
): string {
  const renderedValue = renderNode(decision.value, analysis, projection);
  const operators = decision.operators.map((operator) =>
    renderDecisionOperator(operator, analysis, projection),
  );
  const rendered = `${analysis.matchName}.value(${renderedValue}).pipe(${operators.length === 0 ? '' : `\n${indent(operators.join(',\n'), 2)},\n`})`;
  return markRendered(
    decision.decision,
    markRendered(decision.node, rendered, projection),
    projection,
  );
}

function renderDecisionOperator(
  operator: DecisionOperator,
  analysis: SourceAnalysis,
  projection: ProjectionContext,
): string {
  if (operator.target === 'exhaustive') {
    return `${analysis.matchName}.exhaustive`;
  }
  const operation = operator.args.at(-1)!;
  const renderedOperation = renderNode(operation, analysis, projection);
  const rendered =
    operator.target === 'when'
      ? `${analysis.matchName}.when(${renderNode(operator.args[0]!, analysis, projection)}, ${renderedOperation})`
      : `${analysis.matchName}.orElse(${renderedOperation})`;
  return markRendered(operator.node, rendered, projection);
}

function renderStoryImport(node: SgNode): string {
  const namespace = importClause(node)?.find(byKind('namespace_import'));
  if (namespace !== null && namespace !== undefined) {
    return '';
  }

  const named = importClause(node)?.find(byKind('named_imports'));
  if (named === null || named === undefined) return node.text();
  const remaining = named
    .findAll(byKind('import_specifier'))
    .filter((specifier) => {
      if (specifier.text().trimStart().startsWith('type ')) return true;
      const exported = specifier
        .children()
        .find((child) => child.kind() === 'identifier')
        ?.text();
      return exported === undefined || !ejectableNames.has(exported);
    })
    .map((specifier) => specifier.text());
  if (remaining.length === named.findAll(byKind('import_specifier')).length) {
    return node.text();
  }
  if (remaining.length === 0) return '';
  return `import { ${remaining.join(', ')} } from ${JSON.stringify(storyModule)};`;
}

function ensureNativeImports(
  source: string,
  fileName: string,
  analysis: SourceAnalysis,
): string {
  const withEffect = ensureNamedNativeImport(
    source,
    fileName,
    'Effect',
    analysis.effectName,
    analysis.hasEffectImport,
  );
  const withMatch = ensureNamedNativeImport(
    withEffect,
    fileName,
    'Match',
    analysis.matchName,
    analysis.hasMatchImport,
  );
  return cleanupEjectedSource(withMatch);
}

function ensureNamedNativeImport(
  source: string,
  fileName: string,
  exported: 'Effect' | 'Match',
  local: string,
  alreadyImported: boolean,
): string {
  if (!source.includes(`${local}.`) || alreadyImported) return source;
  const root = parse(languageFor(fileName), source).root();
  const effectImports = importsFrom(root, 'effect');
  const namedImport = effectImports.find((statement) =>
    statement.text().trimStart().startsWith('import type ')
      ? false
      : importClause(statement)?.find(byKind('named_imports')),
  );
  const specifier = exported === local ? exported : `${exported} as ${local}`;
  if (namedImport !== undefined) {
    const named = importClause(namedImport)!.find(byKind('named_imports'))!;
    const current = named
      .findAll(byKind('import_specifier'))
      .map((item) => item.text());
    return root.commitEdits([
      named.replace(`{ ${[...current, specifier].join(', ')} }`),
    ]);
  }
  const insertion = `import { ${specifier} } from 'effect';\n`;
  const first = root.children()[0];
  if (first?.kind() === 'hash_bang_line') {
    return `${first.text()}\n${insertion}${source.slice(first.text().length + 1)}`;
  }
  return `${insertion}${source}`;
}

function findNamedEffectImport(
  root: SgNode,
  exported: 'Effect' | 'Match',
): { readonly local: string } | undefined {
  for (const statement of importsFrom(root, 'effect')) {
    if (statement.text().trimStart().startsWith('import type ')) continue;
    const named = importClause(statement)?.find(byKind('named_imports'));
    for (const specifier of named?.findAll(byKind('import_specifier')) ?? []) {
      const identifiers = specifier
        .children()
        .filter((child) => child.kind() === 'identifier');
      if (
        identifiers[0]?.text() === exported &&
        !specifier.text().trimStart().startsWith('type ')
      ) {
        return { local: identifiers.at(-1)!.text() };
      }
    }
  }
  for (const statement of importsFrom(root, `effect/${exported}`)) {
    if (statement.text().trimStart().startsWith('import type ')) continue;
    const namespace = importClause(statement)?.find(byKind('namespace_import'));
    const local = namespace?.findAll(byKind('identifier')).at(-1)?.text();
    if (local !== undefined) return { local };
  }
  return undefined;
}

function cleanupEjectedSource(source: string): string {
  const lines = source
    .replace(
      /;[ \t]{2,}(?=(?:class|const|export|function|import|let|var)\b)/g,
      ';\n',
    )
    .split('\n');
  while (lines[0]?.trim() === '') lines.shift();
  const compact: string[] = [];
  for (const line of lines) {
    if (
      line.trim() === '' &&
      compact.at(-1)?.trim() === '' &&
      compact.at(-2)?.trim() === ''
    ) {
      continue;
    }
    compact.push(line);
  }
  return compact.join('\n');
}

function importedCall(
  call: SgNode,
  bindings: ReadonlyMap<string, ImportBinding>,
  namespaces: ReadonlyMap<string, NamespaceBinding>,
): StoryExport | undefined {
  const callee = field(call, 'function');
  if (callee?.kind() === 'identifier') {
    return bindings.get(callee.text())?.exported;
  }
  if (callee?.kind() !== 'member_expression') return undefined;
  const object = field(callee, 'object');
  const property = field(callee, 'property');
  if (
    object?.kind() === 'identifier' &&
    property !== null &&
    namespaces.has(object.text()) &&
    ejectableNames.has(property.text())
  ) {
    return property.text() as StoryExport;
  }
  return undefined;
}

function importedStoryReference(
  node: SgNode | null,
  bindings: ReadonlyMap<string, ImportBinding>,
  namespaces: ReadonlyMap<string, NamespaceBinding>,
): StoryExport | undefined {
  if (node?.kind() === 'identifier') {
    return bindings.get(node.text())?.exported;
  }
  if (node?.kind() !== 'member_expression') return undefined;
  const object = field(node, 'object');
  const property = field(node, 'property');
  if (
    object?.kind() !== 'identifier' ||
    property === null ||
    !namespaces.has(object.text()) ||
    !ejectableNames.has(property.text())
  ) {
    return undefined;
  }
  return property.text() as StoryExport;
}

function storyReferences(
  root: SgNode,
  analysis: SourceAnalysis,
): readonly { readonly node: SgNode; readonly exported: StoryExport }[] {
  const importNodeIds = new Set(
    analysis.storyImports.flatMap((statement) =>
      statement.findAll(byKind('identifier')).map((node) => node.id()),
    ),
  );
  const references: Array<{ node: SgNode; exported: StoryExport }> = [];
  for (const identifier of root.findAll(byKind('identifier'))) {
    if (importNodeIds.has(identifier.id())) continue;
    const exported = analysis.bindings.get(identifier.text())?.exported;
    if (exported !== undefined) references.push({ node: identifier, exported });
  }
  for (const member of root.findAll(byKind('member_expression'))) {
    const exported = importedStoryReference(
      member,
      analysis.bindings,
      analysis.namespaces,
    );
    if (exported !== undefined) references.push({ node: member, exported });
  }
  return references;
}

function isAllowedImportedReference(
  identifier: SgNode,
  exported: StoryExport,
  bindings: ReadonlyMap<string, ImportBinding>,
  namespaces: ReadonlyMap<string, NamespaceBinding>,
): boolean {
  const parent = identifier.parent();
  if (
    parent?.kind() === 'call_expression' &&
    field(parent, 'function')?.id() === identifier.id() &&
    importedCall(parent, bindings, namespaces) === exported
  ) {
    return true;
  }
  return exported === 'exhaustive' && isDecisionPipeArgument(identifier);
}

function isDecisionPipeArgument(node: SgNode): boolean {
  const argumentsNode = node.parent();
  if (argumentsNode?.kind() !== 'arguments') return false;
  const pipe = argumentsNode.parent();
  const callee = pipe === null ? null : field(pipe, 'function');
  return (
    pipe?.kind() === 'call_expression' &&
    callee?.kind() === 'member_expression' &&
    field(callee, 'property')?.text() === 'pipe'
  );
}

function isAllowedNamespaceReference(
  identifier: SgNode,
  bindings: ReadonlyMap<string, ImportBinding>,
  namespaces: ReadonlyMap<string, NamespaceBinding>,
): boolean {
  const member = identifier.parent();
  if (
    member?.kind() !== 'member_expression' ||
    field(member, 'object')?.id() !== identifier.id()
  ) {
    return false;
  }
  const property = field(member, 'property')?.text();
  if (property !== undefined && !ejectableNames.has(property)) return true;
  if (property === 'exhaustive' && isDecisionPipeArgument(member)) return true;
  const call = member.parent();
  return (
    call?.kind() === 'call_expression' &&
    field(call, 'function')?.id() === member.id() &&
    importedCall(call, bindings, namespaces) !== undefined
  );
}

function isAliasedImportSource(identifier: SgNode): boolean {
  const specifier = identifier.parent();
  if (specifier?.kind() !== 'import_specifier') return false;
  const identifiers = specifier
    .children()
    .filter((child) => child.kind() === 'identifier');
  return identifiers.length > 1 && identifiers[0]?.id() === identifier.id();
}

const projectionMarkerPrefix = '__laymos_projection_';

function projectionContext(
  root: SgNode,
  analysis: SourceAnalysis,
  anchors: readonly StorySourceAnchor[],
): ProjectionContext {
  const calls = root.findAll(byKind('call_expression'));
  const tokensByNodeId = new Map<number, string[]>();
  const provenanceByToken = new Map<string, StorySourceProvenance>();
  anchors.forEach((anchor, index) => {
    if (anchor.line <= 0 || anchor.column <= 0) return;
    const line = anchor.line - 1;
    const column = anchor.column - 1;
    const call = calls
      .filter((candidate) => {
        const range = candidate.range();
        return (
          (range.start.line < line ||
            (range.start.line === line && range.start.column <= column)) &&
          (range.end.line > line ||
            (range.end.line === line && range.end.column >= column))
        );
      })
      .sort(
        (left, right) =>
          left.range().end.index -
          left.range().start.index -
          (right.range().end.index - right.range().start.index),
      )[0];
    if (call === undefined) return;
    const token = `a${index}`;
    const current = tokensByNodeId.get(call.id()) ?? [];
    current.push(token);
    tokensByNodeId.set(call.id(), current);
    const target = importedCall(call, analysis.bindings, analysis.namespaces);
    const classification =
      anchor.classification ?? (target === 'omit' ? 'omitted' : 'narrated');
    const reason =
      anchor.reason ??
      (target === 'omit' ? omissionReason(callArguments(call)[0]) : undefined);
    provenanceByToken.set(token, {
      id: anchor.id,
      classification,
      ...(reason === undefined ? {} : { reason }),
    });
  });
  return { tokensByNodeId, provenanceByToken };
}

function omissionReason(meta: SgNode | undefined): string | undefined {
  if (meta === undefined) return undefined;
  const object = unwrapExpression(meta);
  if (object.kind() !== 'object') return undefined;
  for (const pair of object
    .children()
    .filter((node) => node.kind() === 'pair')) {
    const key = field(pair, 'key');
    if (key === null || (stringValue(key) ?? key.text()) !== 'reason') continue;
    const value = field(pair, 'value');
    return value === null ? undefined : stringValue(value);
  }
  return undefined;
}

function markRendered(
  node: SgNode,
  rendered: string,
  projection: ProjectionContext,
): string {
  const tokens = projection.tokensByNodeId.get(node.id());
  if (tokens === undefined || tokens.length === 0) return rendered;
  return tokens.reduce(
    (text, token) =>
      `/*${projectionMarkerPrefix}start_${token}__*/${text}/*${projectionMarkerPrefix}end_${token}__*/`,
    rendered,
  );
}

function extractProjection(
  marked: string,
  projection: ProjectionContext,
): StorySourceProjection {
  const marker = new RegExp(
    `/\\*${projectionMarkerPrefix}(start|end)_(a\\d+)__\\*/`,
    'g',
  );
  const output: string[] = [];
  const segments: Array<{
    readonly token: string | undefined;
    readonly start: number;
    readonly end: number;
  }> = [];
  const active: string[] = [];
  let outputLength = 0;
  let cursor = 0;
  for (const match of marked.matchAll(marker)) {
    const index = match.index ?? cursor;
    const chunk = marked.slice(cursor, index);
    output.push(chunk);
    if (chunk.length > 0) {
      segments.push({
        token: active.at(-1),
        start: outputLength,
        end: outputLength + chunk.length,
      });
      outputLength += chunk.length;
    }
    const phase = match[1];
    const token = match[2]!;
    if (phase === 'start') active.push(token);
    else if (active.at(-1) === token) active.pop();
    else {
      const activeIndex = active.lastIndexOf(token);
      if (activeIndex >= 0) active.splice(activeIndex, 1);
    }
    cursor = index + match[0].length;
  }
  const tail = marked.slice(cursor);
  output.push(tail);
  if (tail.length > 0) {
    segments.push({
      token: active.at(-1),
      start: outputLength,
      end: outputLength + tail.length,
    });
  }
  const content = output.join('');
  const merged: typeof segments = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.token === segment.token &&
      previous.end === segment.start
    ) {
      merged[merged.length - 1] = { ...previous, end: segment.end };
    } else {
      merged.push(segment);
    }
  }
  let unnarrated = 0;
  return {
    content,
    ranges: merged.map((segment) => {
      const provenance =
        segment.token === undefined
          ? {
              id: `unnarrated:${++unnarrated}`,
              classification: 'unnarrated' as const,
            }
          : (projection.provenanceByToken.get(segment.token) ?? {
              id: segment.token,
              classification: 'narrated' as const,
            });
      const start = sourcePosition(content, segment.start);
      const end = sourcePosition(content, segment.end);
      return {
        ...provenance,
        start: segment.start,
        end: segment.end,
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
      };
    }),
  };
}

function sourcePosition(
  source: string,
  index: number,
): { readonly line: number; readonly column: number } {
  const lines = source.slice(0, index).split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

function cleanProjectedSource(source: string, fileName: string): string {
  const projectedOnly = retainProjectedGlobals(source, fileName);
  const root = parse(languageFor(fileName), projectedOnly).root();
  const comments = root
    .findAll(byKind('comment'))
    .filter((comment) => !comment.text().includes(projectionMarkerPrefix));
  const cleaned = root.commitEdits(comments.map((node) => node.replace('')));
  const lines = cleaned.split('\n').map((line) => line.trimEnd());
  const compact: string[] = [];
  for (const line of lines) {
    if (line === '' && (compact.length === 0 || compact.at(-1) === '')) {
      continue;
    }
    compact.push(line);
  }
  while (compact.at(-1) === '') compact.pop();
  return compact.join('\n');
}

function retainProjectedGlobals(source: string, fileName: string): string {
  if (!source.includes(projectionMarkerPrefix)) return source;
  const root = parse(languageFor(fileName), source).root();
  const statements = root.children().filter((node) => node.isNamed());
  const roots = statements.filter((statement) =>
    statement.text().includes(projectionMarkerPrefix),
  );
  if (roots.length === 0) return source;

  const declarations = new Map<string, SgNode[]>();
  for (const statement of statements) {
    for (const name of declaredNames(statement)) {
      const current = declarations.get(name) ?? [];
      current.push(statement);
      declarations.set(name, current);
    }
  }

  const retained = new Map(
    roots.map((statement) => [statement.id(), statement]),
  );
  const pending = [...roots];
  while (pending.length > 0) {
    const statement = pending.pop()!;
    for (const identifier of statement.findAll(byKind('identifier'))) {
      for (const dependency of declarations.get(identifier.text()) ?? []) {
        if (retained.has(dependency.id())) continue;
        retained.set(dependency.id(), dependency);
        pending.push(dependency);
      }
    }
  }

  const removals = statements
    .filter(
      (statement) =>
        statement.kind() !== 'comment' &&
        statement.kind() !== 'import_statement' &&
        !retained.has(statement.id()),
    )
    .map((statement) => statement.replace(''));
  const globals = removals.length === 0 ? source : root.commitEdits(removals);
  return retainProjectedClassMethods(globals, fileName);
}

function retainProjectedClassMethods(source: string, fileName: string): string {
  const root = parse(languageFor(fileName), source).root();
  const removalNodes: SgNode[] = [];
  for (const statement of root.children()) {
    const declaration = unwrapExport(statement);
    if (
      declaration === undefined ||
      !new Set(['class_declaration', 'abstract_class_declaration']).has(
        String(declaration.kind()),
      )
    ) {
      continue;
    }
    const body = field(declaration, 'body');
    if (body === null) continue;
    const methods = body
      .children()
      .filter((member) => member.kind() === 'method_definition');
    const roots = methods.filter((method) =>
      method.text().includes(projectionMarkerPrefix),
    );
    if (roots.length === 0) continue;

    const methodsByName = new Map<string, SgNode[]>();
    for (const method of methods) {
      const name = classMethodName(method);
      if (name === undefined) continue;
      const current = methodsByName.get(name) ?? [];
      current.push(method);
      methodsByName.set(name, current);
    }
    const retained = new Map(
      methods
        .filter(
          (method) =>
            roots.some((rootMethod) => rootMethod.id() === method.id()) ||
            classMethodName(method) === 'constructor',
        )
        .map((method) => [method.id(), method]),
    );
    const pending = [...retained.values()];
    let dynamicAccess = false;
    while (pending.length > 0 && !dynamicAccess) {
      const method = pending.pop()!;
      const references = referencedClassMembers(method, declaration);
      dynamicAccess = references.dynamic;
      for (const name of references.names) {
        for (const dependency of methodsByName.get(name) ?? []) {
          if (retained.has(dependency.id())) continue;
          retained.set(dependency.id(), dependency);
          pending.push(dependency);
        }
      }
    }
    if (dynamicAccess) continue;
    removalNodes.push(
      ...methods.filter((method) => !retained.has(method.id())),
    );
  }
  return removalNodes.length === 0
    ? source
    : root.commitEdits(removalNodes.map((node) => node.replace('')));
}

function unwrapExport(statement: SgNode): SgNode | undefined {
  if (statement.kind() !== 'export_statement') return statement;
  return (
    field(statement, 'declaration') ??
    statement.children().find((child) => declarationKind(String(child.kind())))
  );
}

function classMethodName(method: SgNode): string | undefined {
  const name = field(method, 'name');
  if (name === null) return undefined;
  return stringValue(name) ?? name.text();
}

function referencedClassMembers(
  method: SgNode,
  declaration: SgNode,
): { readonly names: ReadonlySet<string>; readonly dynamic: boolean } {
  const names = new Set<string>();
  for (const member of method.findAll(byKind('member_expression'))) {
    const property = field(member, 'property');
    if (property !== null) names.add(stringValue(property) ?? property.text());
  }
  const className = field(declaration, 'name')?.text();
  for (const member of method.findAll(byKind('subscript_expression'))) {
    const object = field(member, 'object')?.text();
    if (object !== 'this' && object !== className) continue;
    const index = field(member, 'index');
    const name = index === null ? undefined : stringValue(index);
    if (name === undefined) return { names, dynamic: true };
    names.add(name);
  }
  return { names, dynamic: false };
}

function declaredNames(statement: SgNode): readonly string[] {
  const declaration = unwrapExport(statement);
  if (declaration === undefined || declaration === null) return [];
  if (
    declaration.kind() === 'lexical_declaration' ||
    declaration.kind() === 'variable_declaration'
  ) {
    return declaration
      .findAll(byKind('variable_declarator'))
      .flatMap((declarator) => {
        const name = field(declarator, 'name');
        if (name === null) return [];
        if (name.kind() === 'identifier') return [name.text()];
        return name.findAll(byKind('identifier')).map((node) => node.text());
      });
  }
  const name = field(declaration, 'name');
  return name?.kind() === 'identifier' ? [name.text()] : [];
}

function declarationKind(kind: string): boolean {
  return new Set([
    'abstract_class_declaration',
    'class_declaration',
    'enum_declaration',
    'function_declaration',
    'generator_function_declaration',
    'interface_declaration',
    'lexical_declaration',
    'type_alias_declaration',
    'variable_declaration',
  ]).has(kind);
}

function callArguments(call: SgNode): readonly SgNode[] {
  const args = field(call, 'arguments');
  if (args === null) return [];
  return args
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment');
}

function field(node: SgNode | null, name: string): SgNode | null {
  return node === null
    ? null
    : (node as SgNode & { field(name: string): SgNode | null }).field(name);
}

function importsFrom(root: SgNode, moduleName: string): readonly SgNode[] {
  return root
    .findAll(byKind('import_statement'))
    .filter((statement) => moduleSource(statement) === moduleName);
}

function importClause(statement: SgNode): SgNode | undefined {
  return statement.children().find((child) => child.kind() === 'import_clause');
}

function moduleSource(statement: SgNode): string | undefined {
  const source = field(statement, 'source');
  return source === null ? undefined : stringValue(source);
}

function stringValue(node: SgNode): string | undefined {
  if (node.kind() !== 'string') return undefined;
  const text = node.text();
  return text.length >= 2 ? text.slice(1, -1) : undefined;
}

function assertValidSyntax(root: SgNode, fileName: string): void {
  const error = root.find(byKind('ERROR'));
  if (error !== null) {
    throw new TransformError(
      diagnostic(fileName, error, 'the file contains unsupported syntax'),
    );
  }
}

function diagnostic(fileName: string, node: SgNode, message: string): string {
  const { line, column } = node.range().start;
  return `${fileName}:${line + 1}:${column + 1}: ${message}`;
}

function requireArity(
  subject: string,
  args: readonly SgNode[],
  expected: number,
): void {
  if (args.length !== expected) {
    throw new TransformError(
      `${subject} expects ${expected} argument${expected === 1 ? '' : 's'}`,
    );
  }
}

function isFunction(node: SgNode): boolean {
  return (
    node.kind() === 'arrow_function' || node.kind() === 'function_expression'
  );
}

function byKind(kind: string): { readonly rule: { readonly kind: never } } {
  return { rule: { kind: kind as never } };
}

function freshNativeName(
  exported: 'Effect' | 'Match',
  occupied: ReadonlySet<string>,
): string {
  if (!occupied.has(exported)) return exported;
  const native = `Native${exported}`;
  if (!occupied.has(native)) return native;
  let suffix = 2;
  while (occupied.has(`${native}${suffix}`)) suffix += 1;
  return `${native}${suffix}`;
}

function languageFor(fileName: string): Lang {
  return /\.(?:tsx|jsx)$/.test(fileName) ? Lang.Tsx : Lang.TypeScript;
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function writeAtomically(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  content: string,
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    const info = yield* fs.stat(target);
    const temporary = yield* fs.makeTempFile({
      directory: path.dirname(target),
      prefix: '.laymos-eject-',
    });
    yield* fs.writeFileString(temporary, content);
    yield* fs.chmod(temporary, info.mode);
    yield* fs.rename(temporary, target);
  });
}

function restoreRewrites(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  baseDir: string,
  rewrites: readonly StoryEjectionRewrite[],
): Effect.Effect<void, never> {
  return Effect.forEach(
    [...rewrites].reverse(),
    (rewrite) =>
      writeAtomically(
        fs,
        path,
        path.join(baseDir, rewrite.path),
        rewrite.before,
      ).pipe(Effect.ignore),
    { discard: true },
  );
}

function restoreRemovedStories(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  baseDir: string,
  removed: readonly {
    readonly path: string;
    readonly content: string;
    readonly mode: number;
  }[],
): Effect.Effect<void, never> {
  return Effect.forEach(
    [...removed].reverse(),
    (backup) =>
      writeNewFileAtomically(
        fs,
        path,
        path.join(baseDir, backup.path),
        backup.content,
        backup.mode,
      ).pipe(Effect.ignore),
    { discard: true },
  );
}

function writeNewFileAtomically(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  content: string,
  mode: number,
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    const temporary = yield* fs.makeTempFile({
      directory: path.dirname(target),
      prefix: '.laymos-eject-',
    });
    yield* fs.writeFileString(temporary, content);
    yield* fs.chmod(temporary, mode);
    yield* fs.rename(temporary, target);
  });
}
