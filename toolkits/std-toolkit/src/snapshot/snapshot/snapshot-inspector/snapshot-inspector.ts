import type {
  ContractSnapshot,
  SnapshotDiagnostic,
} from '../../domain/index.js';
import { compareStrings } from '../../domain/index.js';

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function definitionPath(identity: string): string {
  return `/schemas/${escapePointer(identity)}`;
}

function inspect(snapshot: ContractSnapshot): readonly SnapshotDiagnostic[] {
  const diagnostics = snapshot.schemas
    .flatMap((definition) =>
      definition.versions.flatMap((version) =>
        version.unverifiable.map((marker) => ({
          ...marker,
          path: `${definitionPath(definition.identity)}/versions/${escapePointer(version.version)}${marker.path === '/' ? '' : marker.path}`,
        })),
      ),
    )
    .sort((a, b) =>
      compareStrings(`${a.path}:${a.kind}`, `${b.path}:${b.kind}`),
    );
  return diagnostics;
}

export { inspect as inspectSnapshot };
