/**
 * Source-of-Truth entities are persisted as envelopes `{ value, meta }`, where
 * `value` is the domain object (carrying its own `id`/`code`) and `meta._u` is
 * the ISO update cursor. Reading `entity.id` off the envelope yields nothing —
 * the id lives on `entity.value`. This projects an envelope into the fields the
 * drill-down list actually renders.
 */
export type SotEntityView = {
  id: string;
  cursor: string | null;
  value: unknown;
};

const isEnvelope = (
  raw: unknown,
): raw is { value: unknown; meta?: { _u?: unknown } } =>
  raw != null && typeof raw === 'object' && 'value' in raw;

export const sotEntityView = (raw: unknown): SotEntityView => {
  const value = isEnvelope(raw) ? raw.value : raw;
  const meta = isEnvelope(raw) ? raw.meta : undefined;
  const cursor = typeof meta?._u === 'string' ? meta._u : null;
  const fields =
    value != null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  const rawId = fields?.id ?? fields?.code;
  const id =
    typeof rawId === 'string' || typeof rawId === 'number'
      ? String(rawId)
      : '—';
  return { id, cursor, value };
};
