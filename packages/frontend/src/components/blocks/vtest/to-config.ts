import type { VtestConfig } from './types';

/**
 * Extract a renderable {@link VtestConfig} from a raw, untyped devtools report
 * `vtest` slice.
 *
 * Pass the whole slice (the `{ available }` union). Returns the inner
 * `{ package, toc, features }` payload when `available: true`, or `null` when
 * the tool is not configured (or the value is absent/malformed). No schema
 * decode is performed — the available shape is trusted via a thin cast.
 */
export function toVtestConfig(raw: unknown): VtestConfig | null {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { available?: unknown }).available === true
  ) {
    return raw as VtestConfig;
  }
  return null;
}
