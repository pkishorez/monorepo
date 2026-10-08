import { posix } from 'node:path';

import { JsonSchema, Schema } from 'effect';

import {
  ProjectConfigInputSchema,
  ProjectConfigSchema,
  type Config,
  type ConfigValidationIssue,
} from '../../architecture-analysis-schema/index.js';

export { ProjectConfigInputSchema, ProjectConfigSchema };
export type { Config, ConfigValidationIssue };

export const sharedRuleSource = '*';

// A key the schema does not know is a typo or a config from before
// ADR-0019; either way it must not decode into a Project with no Rules.
export function decodeProjectConfig(input: unknown) {
  return Schema.decodeUnknownEffect(ProjectConfigInputSchema, {
    onExcessProperty: 'error',
  })(input);
}

/**
 * What can be checked before any file is read: every path is canonical, a
 * Rule never points from inside a thing to the thing itself, `*` only ever
 * names a source, and an Exception never joins the same two paths twice.
 */
export function validateConfig(
  config: Config,
): readonly ConfigValidationIssue[] {
  const pathIssues = findInvalidPaths(config);
  if (pathIssues.length > 0) return pathIssues;
  return [...validateRules(config), ...validateExceptions(config)];
}

export function projectConfigJsonSchema(): Readonly<Record<string, unknown>> {
  // Unknown keys in laymos.config.json are typos, so the published schema
  // rejects them. Effect leaves objects open unless told otherwise.
  const { schema, definitions } = JsonSchema.toDocumentDraft07(
    Schema.toJsonSchemaDocument(ProjectConfigInputSchema, {
      onExcessProperty: 'error',
    }),
  );
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...schema,
    ...(Object.keys(definitions).length > 0 ? { definitions } : {}),
  };
}

export function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}

export function overlaps(left: string, right: string): boolean {
  return contains(left, right) || contains(right, left);
}

export function isCanonicalPath(path: string): boolean {
  if (path === '.') return true;
  if (
    path.length === 0 ||
    path === '..' ||
    path.includes('\\') ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.startsWith('../') ||
    /^[A-Za-z]:/.test(path)
  ) {
    return false;
  }
  return posix.normalize(path) === path;
}

interface ConfigPath {
  readonly location: string;
  readonly path: string;
}

function findInvalidPaths(config: Config): readonly ConfigValidationIssue[] {
  return configPaths(config)
    .filter(({ path }) => !isCanonicalPath(path))
    .map(({ location, path }) => ({
      kind: 'path' as const,
      message: `${location} must be a canonical project-relative path: ${JSON.stringify(path)}`,
    }));
}

function configPaths(config: Config): readonly ConfigPath[] {
  return [
    ...config.sourceRoots.map((path, index) => ({
      location: `sourceRoots[${index}]`,
      path,
    })),
    ...config.ignoredPaths.map((path, index) => ({
      location: `ignoredPaths[${index}]`,
      path,
    })),
    ...(config.storiesPath === undefined
      ? []
      : [{ location: 'storiesPath', path: config.storiesPath }]),
    ...config.fileModules.map((path, index) => ({
      location: `fileModules[${index}]`,
      path,
    })),
    ...Object.entries(config.rules).flatMap(([from, targets]) => [
      ...(from === sharedRuleSource ? [] : [{ location: 'rules', path: from }]),
      ...targets.map((path, index) => ({
        location: `rules[${JSON.stringify(from)}][${index}]`,
        path,
      })),
    ]),
    ...config.exceptions.flatMap(({ from, to }, index) => [
      { location: `exceptions[${index}].from`, path: from },
      { location: `exceptions[${index}].to`, path: to },
    ]),
  ];
}

function validateRules(config: Config): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  for (const [from, targets] of Object.entries(config.rules)) {
    for (const to of targets) {
      if (to === sharedRuleSource) {
        issues.push({
          kind: 'rule',
          message: `Rule ${from} -> *: "*" may only name a Rule's source`,
        });
      } else if (from !== sharedRuleSource && overlaps(from, to)) {
        issues.push({
          kind: 'rule',
          message:
            contains(to, from) && to !== from
              ? `Rule ${from} -> ${to}: a Module never imports an ancestor; only an Exception with a Reason may`
              : `Rule ${from} -> ${to}: a Module's own files already import every Module nested below it`,
        });
      }
    }
  }
  return issues;
}

function validateExceptions(config: Config): readonly ConfigValidationIssue[] {
  const seen = new Set<string>();
  const issues: ConfigValidationIssue[] = [];
  for (const { from, to } of config.exceptions) {
    const key = `${from} -> ${to}`;
    if (from === to) {
      issues.push({
        kind: 'exception',
        message: `Exception ${key}: a Module is always free to import itself`,
      });
    } else if (seen.has(key)) {
      issues.push({
        kind: 'exception',
        message: `Exception ${key} is declared twice`,
      });
    }
    seen.add(key);
  }
  return issues;
}
