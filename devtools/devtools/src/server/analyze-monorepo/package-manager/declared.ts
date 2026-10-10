import type { PackageManager } from '../../../rpc/index.js';

const known: ReadonlySet<string> = new Set<PackageManager>([
  'pnpm',
  'npm',
  'yarn',
  'bun',
]);

/**
 * The Package Manager a root `package.json` names in its `packageManager`
 * field (`"<name>@<version>"`, as Corepack writes it), or `undefined` when
 * the text is missing, not JSON, or names none of the four.
 */
export function declaredPackageManager(
  manifestText: string | undefined,
): PackageManager | undefined {
  if (manifestText === undefined) return undefined;
  let field: unknown;
  try {
    field = (JSON.parse(manifestText) as { packageManager?: unknown } | null)
      ?.packageManager;
  } catch {
    return undefined;
  }
  if (typeof field !== 'string') return undefined;
  const name = field.split('@')[0]?.trim() ?? '';
  return known.has(name) ? (name as PackageManager) : undefined;
}
