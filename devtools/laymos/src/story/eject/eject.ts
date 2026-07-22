import { Lang, parse } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import { Data, Effect, FileSystem, Path } from 'effect';

const storyModule = 'laymos/story';
const storyFilePattern = /\.story\.[cm]?[jt]sx?$/;
const sourceFileGlob = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const excludedSourceGlobs = ['**/node_modules/**', '**/dist/**', '**/.*'];
const ejectableNames = new Set([
  'all',
  'decision',
  'flow',
  'forEach',
  'omit',
  'step',
]);

type StoryExport = 'all' | 'decision' | 'flow' | 'forEach' | 'omit' | 'step';

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

export class StoryEjectionError extends Data.TaggedError('StoryEjectionError')<{
  readonly message: string;
}> {}

class TransformError extends Error {}

export function transformStorySource(source: string, fileName: string): string {
  if (!source.includes(storyModule)) return source;
  const root = parse(languageFor(fileName), source).root();
  assertValidSyntax(root, fileName);
  const analysis = analyzeSource(root, fileName);
  if (analysis.unsupported.length > 0) {
    throw new TransformError(analysis.unsupported.join('\n'));
  }
  const transformed = renderNode(root, analysis);
  const output = ensureEffectImport(transformed, fileName, analysis);
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
  if (remaining.bindings.size > 0 || remainingCall !== undefined) {
    throw new TransformError(
      `${fileName}: Story ejection left ejectable imports behind`,
    );
  }
  return output;
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
    });

    yield* writeAll.pipe(
      Effect.catch((cause) =>
        restoreRewrites(fs, path, baseDir, written).pipe(
          Effect.andThen(
            Effect.fail(
              new StoryEjectionError({
                message: `Story ejection could not write source changes: ${String(cause)}`,
              }),
            ),
          ),
        ),
      ),
    );

    const deletionFailures: string[] = [];
    for (const relativePath of plan.deletions) {
      const removed = yield* fs.remove(path.join(baseDir, relativePath)).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
      if (!removed) deletionFailures.push(relativePath);
    }
    if (deletionFailures.length > 0) {
      return yield* new StoryEjectionError({
        message: `Source was ejected, but these Story files could not be deleted:\n${deletionFailures.map((file) => `- ${file}`).join('\n')}`,
      });
    }

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
      !isImportedCallReference(
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

  const effectImport = findEffectImport(root);
  const occupied = new Set(
    root
      .findAll(byKind('identifier'))
      .filter((node) => !isAliasedImportSource(node))
      .map((node) => node.text()),
  );
  const effectName = effectImport?.local ?? freshEffectName(occupied);

  return {
    bindings,
    namespaces,
    storyImports,
    unsupported: [...new Set(unsupported)],
    effectName,
    hasEffectImport: effectImport !== undefined,
  };
}

function renderNode(node: SgNode, analysis: SourceAnalysis): string {
  if (node.kind() === 'call_expression') {
    const immediateFlow = renderImmediateFlowCall(node, analysis);
    if (immediateFlow !== undefined) return immediateFlow;

    const decision = decisionChain(node, analysis);
    if (decision !== undefined) return renderDecision(decision, analysis);

    const target = importedCall(node, analysis.bindings, analysis.namespaces);
    if (target !== undefined) {
      const args = callArguments(node);
      if (target === 'decision') {
        throw new TransformError(
          diagnostic(
            'source',
            node,
            'Decision chains must end in .otherwise(...) or .exhaustive()',
          ),
        );
      }
      return renderSimpleCall(target, node, args, analysis);
    }
  }

  if (
    node.kind() === 'import_statement' &&
    analysis.storyImports.some((item) => item.id() === node.id())
  ) {
    return renderStoryImport(node);
  }

  const edits = node.children().flatMap((child) => {
    const rendered = renderNode(child, analysis);
    return rendered === child.text() ? [] : [child.replace(rendered)];
  });
  return edits.length === 0 ? node.text() : node.commitEdits(edits);
}

function renderImmediateFlowCall(
  call: SgNode,
  analysis: SourceAnalysis,
): string | undefined {
  const callee = field(call, 'function');
  if (
    callee?.kind() !== 'call_expression' ||
    importedCall(callee, analysis.bindings, analysis.namespaces) !== 'flow'
  ) {
    return undefined;
  }
  const flowArgs = callArguments(callee);
  requireArity('flow', flowArgs, 3);
  const operation = flowArgs[2]!;
  const callArgs = field(call, 'arguments');
  if (callArgs === null) return undefined;
  if (
    callArguments(call).length === 0 &&
    operation.kind() === 'arrow_function'
  ) {
    const parameters = field(operation, 'parameters');
    const body = field(operation, 'body');
    if (
      parameters !== null &&
      body !== null &&
      !parameters.children().some((child) => child.isNamed()) &&
      body.kind() !== 'statement_block'
    ) {
      return renderNode(body, analysis);
    }
  }
  return `(${renderNode(operation, analysis)})${renderNode(callArgs, analysis)}`;
}

function renderSimpleCall(
  target: Exclude<StoryExport, 'decision'>,
  call: SgNode,
  args: readonly SgNode[],
  analysis: SourceAnalysis,
): string {
  const effect = analysis.effectName;
  if (target === 'flow') {
    requireArity(target, args, 3);
    return renderNode(args[2]!, analysis);
  }
  if (target === 'step') {
    requireArity(target, args, 3);
    const operation = args[2]!;
    const rendered = renderNode(operation, analysis);
    if (isFunction(operation)) return `${effect}.suspend(${rendered})`;
    if (
      operation.kind() === 'call_expression' ||
      isEffectMember(operation, analysis)
    ) {
      return rendered;
    }
    return `((operation) => typeof operation === 'function' ? ${effect}.suspend(operation) : operation)(${rendered})`;
  }
  if (target === 'omit') {
    if (args.length !== 1 && args.length !== 2) {
      throw new TransformError('omit expects one or two arguments');
    }
    const operation = args.at(-1)!;
    return `${effect}.suspend(${renderNode(operation, analysis)})`;
  }
  const callArgs = field(call, 'arguments');
  if (callArgs === null) {
    throw new TransformError(`${target} has no argument list`);
  }
  const renderedArgs = renderNode(callArgs, analysis);
  return `${effect}.${target === 'all' ? 'all' : 'forEach'}${renderedArgs}`;
}

interface DecisionArm {
  readonly value?: SgNode;
  readonly body: SgNode;
  readonly otherwise: boolean;
}

interface DecisionChain {
  readonly selector: SgNode;
  readonly arms: readonly DecisionArm[];
  readonly exhaustive: boolean;
}

function decisionChain(
  endpoint: SgNode,
  analysis: SourceAnalysis,
): DecisionChain | undefined {
  const endpointMember = field(endpoint, 'function');
  if (endpointMember?.kind() !== 'member_expression') return undefined;
  const endpointName = field(endpointMember, 'property')?.text();
  if (endpointName !== 'otherwise' && endpointName !== 'exhaustive') {
    return undefined;
  }

  const arms: DecisionArm[] = [];
  if (endpointName === 'otherwise') {
    const args = callArguments(endpoint);
    requireArity('otherwise', args, 2);
    arms.unshift({ body: args[1]!, otherwise: true });
  } else if (callArguments(endpoint).length !== 0) {
    throw new TransformError('Decision .exhaustive() accepts no arguments');
  }

  let current = field(endpointMember, 'object');
  while (current?.kind() === 'call_expression') {
    const member = field(current, 'function');
    if (member?.kind() !== 'member_expression') break;
    if (field(member, 'property')?.text() !== 'when') break;
    const args = callArguments(current);
    requireArity('when', args, 3);
    if (!isDecisionKey(args[0]!)) {
      throw new TransformError(
        'Decision .when() keys must be string, finite number, or boolean literals',
      );
    }
    arms.unshift({ value: args[0]!, body: args[2]!, otherwise: false });
    current = field(member, 'object');
  }

  if (current?.kind() !== 'call_expression') return undefined;
  if (
    importedCall(current, analysis.bindings, analysis.namespaces) !== 'decision'
  ) {
    return undefined;
  }
  const args = callArguments(current);
  requireArity('decision', args, 3);
  return {
    selector: args[2]!,
    arms,
    exhaustive: endpointName === 'exhaustive',
  };
}

function isDecisionKey(node: SgNode): boolean {
  if (
    node.kind() === 'string' ||
    node.kind() === 'true' ||
    node.kind() === 'false'
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
  decision: DecisionChain,
  analysis: SourceAnalysis,
): string {
  const effect = analysis.effectName;
  const selector = renderNode(decision.selector, analysis);
  const selectorEffect = isFunction(decision.selector)
    ? `${effect}.suspend(${selector})`
    : isUnambiguousValue(decision.selector)
      ? `${effect}.succeed(${selector})`
      : `typeof selector === 'function' ? ${effect}.suspend(selector) : ${effect}.succeed(selector)`;
  const cases = decision.arms.map((arm) => renderDecisionArm(arm, analysis));
  if (decision.exhaustive) {
    cases.push(
      `default:\n  return ${effect}.die(new Error(\`Unexpected decision value: \${String(decisionValue)}\`));`,
    );
  }
  const flatMap = `${effect}.flatMap(${selectorEffect}, (decisionValue) => {\n  switch (decisionValue) {\n${indent(cases.join('\n'), 4)}\n  }\n})`;
  return isFunction(decision.selector) || isUnambiguousValue(decision.selector)
    ? flatMap
    : `((selector) => ${flatMap})(${selector})`;
}

function renderDecisionArm(arm: DecisionArm, analysis: SourceAnalysis): string {
  const label = arm.otherwise
    ? 'default:'
    : `case ${renderNode(arm.value!, analysis)}:`;
  return `${label}\n  return ${renderArmBody(arm.body, analysis)};`;
}

function renderArmBody(body: SgNode, analysis: SourceAnalysis): string {
  const rendered = renderNode(body, analysis);
  if (body.kind() !== 'arrow_function') {
    return `(${rendered})(decisionValue)`;
  }
  const parameters = field(body, 'parameters');
  const bodyNode = field(body, 'body');
  if (parameters === null || bodyNode === null) {
    return `(${rendered})(decisionValue)`;
  }
  const parameterNodes = parameters
    .children()
    .filter((child) => child.isNamed() && child.kind() !== 'comment');
  if (parameterNodes.length === 0 && bodyNode.kind() !== 'statement_block') {
    return renderNode(bodyNode, analysis);
  }
  return `(${rendered})(decisionValue)`;
}

function renderStoryImport(node: SgNode): string {
  const namespace = importClause(node)?.find(byKind('namespace_import'));
  if (namespace !== null && namespace !== undefined) {
    const local = namespace.findAll(byKind('identifier')).at(-1)?.text();
    if (local === undefined) return node.text();
    const usedForOtherExports = node
      .getRoot()
      .root()
      .findAll(byKind('member_expression'))
      .some((member) => {
        const object = field(member, 'object');
        const property = field(member, 'property');
        return (
          object?.text() === local &&
          property !== null &&
          !ejectableNames.has(property.text())
        );
      });
    return usedForOtherExports ? node.text() : '';
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

function ensureEffectImport(
  source: string,
  fileName: string,
  analysis: SourceAnalysis,
): string {
  if (!needsEffect(source, analysis.effectName) || analysis.hasEffectImport) {
    return source;
  }
  const root = parse(languageFor(fileName), source).root();
  const effectImports = importsFrom(root, 'effect');
  const namedImport = effectImports.find((statement) =>
    statement.text().trimStart().startsWith('import type ')
      ? false
      : importClause(statement)?.find(byKind('named_imports')),
  );
  const specifier =
    analysis.effectName === 'Effect'
      ? 'Effect'
      : `Effect as ${analysis.effectName}`;
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

function findEffectImport(
  root: SgNode,
): { readonly local: string } | undefined {
  for (const statement of importsFrom(root, 'effect')) {
    if (statement.text().trimStart().startsWith('import type ')) continue;
    const named = importClause(statement)?.find(byKind('named_imports'));
    for (const specifier of named?.findAll(byKind('import_specifier')) ?? []) {
      const identifiers = specifier
        .children()
        .filter((child) => child.kind() === 'identifier');
      if (
        identifiers[0]?.text() === 'Effect' &&
        !specifier.text().trimStart().startsWith('type ')
      ) {
        return { local: identifiers.at(-1)!.text() };
      }
    }
  }
  for (const statement of importsFrom(root, 'effect/Effect')) {
    if (statement.text().trimStart().startsWith('import type ')) continue;
    const namespace = importClause(statement)?.find(byKind('namespace_import'));
    const local = namespace?.findAll(byKind('identifier')).at(-1)?.text();
    if (local !== undefined) return { local };
  }
  return undefined;
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

function isImportedCallReference(
  identifier: SgNode,
  exported: StoryExport,
  bindings: ReadonlyMap<string, ImportBinding>,
  namespaces: ReadonlyMap<string, NamespaceBinding>,
): boolean {
  const parent = identifier.parent();
  return (
    parent?.kind() === 'call_expression' &&
    field(parent, 'function')?.id() === identifier.id() &&
    importedCall(parent, bindings, namespaces) === exported
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

function isUnambiguousValue(node: SgNode): boolean {
  return new Set([
    'binary_expression',
    'false',
    'number',
    'parenthesized_expression',
    'string',
    'template_string',
    'ternary_expression',
    'true',
    'unary_expression',
  ]).has(String(node.kind()));
}

function byKind(kind: string): { readonly rule: { readonly kind: never } } {
  return { rule: { kind: kind as never } };
}

function isEffectMember(node: SgNode, analysis: SourceAnalysis): boolean {
  return (
    node.kind() === 'member_expression' &&
    field(node, 'object')?.text() === analysis.effectName
  );
}

function needsEffect(source: string, effectName: string): boolean {
  return source.includes(`${effectName}.`);
}

function freshEffectName(occupied: ReadonlySet<string>): string {
  if (!occupied.has('Effect')) return 'Effect';
  if (!occupied.has('NativeEffect')) return 'NativeEffect';
  let suffix = 2;
  while (occupied.has(`NativeEffect${suffix}`)) suffix += 1;
  return `NativeEffect${suffix}`;
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
