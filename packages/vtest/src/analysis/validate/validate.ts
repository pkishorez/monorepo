import { Effect } from 'effect';
import type { Diagnostic, Feature, Toc } from '../model/index.js';
import { discoverFeatures, type DiscoverError } from '../discover/index.js';
import { loadToc, TocError } from '../toc/index.js';

const isMissingToc = (error: TocError): boolean =>
  typeof error.reason === 'object' &&
  error.reason !== null &&
  (error.reason as { code?: string }).code === 'ERR_MODULE_NOT_FOUND';

const featureDiagnostics = (feature: Feature): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = [];
  const directiveIds = feature.directives.map((d) => d.id);
  const groupIds = new Set(feature.groups.map((g) => g.id));

  const seen = new Set<string>();
  for (const id of directiveIds) {
    if (seen.has(id)) {
      out.push({
        level: 'error',
        feature: feature.name,
        groupId: id,
        message: `duplicate directive id '${id}' in feature '${feature.name}'`,
      });
    }
    seen.add(id);
    if (!groupIds.has(id)) {
      out.push({
        level: 'error',
        feature: feature.name,
        groupId: id,
        message: `directive '${id}' has no test folder tests/${id}`,
      });
    }
  }

  const directiveSet = new Set(directiveIds);
  for (const group of feature.groups) {
    if (!directiveSet.has(group.id)) {
      out.push({
        level: 'warning',
        feature: feature.name,
        groupId: group.id,
        message: `test folder '${group.id}' has no directive in feature '${feature.name}'`,
      });
    }
  }
  return out;
};

const tocDiagnostics = (
  toc: Toc,
  features: ReadonlyArray<Feature>,
): ReadonlyArray<Diagnostic> => {
  const out: Array<Diagnostic> = [];
  const featureNames = new Set(features.map((f) => f.name));
  const tocFeatures = new Set<string>();
  for (const section of toc.sections) {
    for (const name of section.features) {
      tocFeatures.add(name);
      if (!featureNames.has(name)) {
        out.push({
          level: 'error',
          feature: name,
          message: `toc lists feature '${name}' with no folder`,
        });
      }
    }
  }
  for (const feature of features) {
    if (!tocFeatures.has(feature.name)) {
      out.push({
        level: 'warning',
        feature: feature.name,
        message: `feature '${feature.name}' is not in the toc (draft)`,
      });
    }
  }
  return out;
};

/**
 * Statically validate a package's doc-test contract, returning all
 * diagnostics without running any tests. Toc rules are skipped when the
 * package has no `vtest/toc.ts`.
 */
export const validate = (
  packageRoot: string,
): Effect.Effect<ReadonlyArray<Diagnostic>, DiscoverError | TocError> =>
  Effect.gen(function* () {
    const features = yield* discoverFeatures(packageRoot);
    const diagnostics: Array<Diagnostic> = [];
    for (const feature of features) {
      diagnostics.push(...featureDiagnostics(feature));
    }
    const toc: Toc | null = yield* loadToc(packageRoot).pipe(
      Effect.catch((error) =>
        isMissingToc(error)
          ? Effect.succeed<Toc | null>(null)
          : Effect.fail(error),
      ),
    );
    if (toc !== null) {
      diagnostics.push(...tocDiagnostics(toc, features));
    }
    return diagnostics;
  });
