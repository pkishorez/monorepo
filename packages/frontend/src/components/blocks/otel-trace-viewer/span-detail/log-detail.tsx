import { cn } from '#lib/utils';

import type { OtelEvent } from '../trace-model';
import { JsonTree } from './json-tree';

const EPOCH_MS_THRESHOLD = 946684800000;

const BODY_KEYS = new Set(['body', 'message', 'log.message']);
const META_KEYS = new Set([
  'body',
  'message',
  'log.message',
  'severity',
  'level',
  'log.severity',
  'log.level',
  'severityText',
  'severityNumber',
  'log.severityText',
  'log.severityNumber',
]);

function formatTimestamp(ts: number): string {
  if (ts >= EPOCH_MS_THRESHOLD) {
    try {
      return new Date(ts).toISOString();
    } catch {
      return String(ts);
    }
  }
  return `${ts}ms`;
}

function pickBody(attrs: Record<string, unknown>): {
  key: string | null;
  value: unknown;
} {
  for (const key of BODY_KEYS) {
    if (key in attrs) return { key, value: attrs[key] };
  }
  return { key: null, value: null };
}

/**
 * Convert flat dotted-key attributes (`auth.role_guard.user_id`) into a
 * nested object so the JSON viewer can render them as a tree. Falls back to
 * a `__leaf` slot when a prefix collision would clobber an existing scalar.
 */
function nestDottedKeys(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const parts = key.split('.');
    if (parts.length === 1) {
      out[key] = value;
      continue;
    }
    let cursor: Record<string, unknown> = out;
    let aborted = false;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const existing = cursor[part];
      if (existing === undefined) {
        const next: Record<string, unknown> = {};
        cursor[part] = next;
        cursor = next;
      } else if (
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing)
      ) {
        cursor = existing as Record<string, unknown>;
      } else {
        out[key] = value;
        aborted = true;
        break;
      }
    }
    if (aborted) continue;
    const leaf = parts[parts.length - 1]!;
    if (cursor[leaf] !== undefined) {
      out[key] = value;
    } else {
      cursor[leaf] = value;
    }
  }
  return out;
}

interface SeverityChipMeta {
  dotClass: string;
  labelClass: string;
}

interface LogDetailProps {
  event: OtelEvent;
  size: 'compact' | 'roomy';
  severityMeta: SeverityChipMeta | null;
  severityLabel: string | null;
}

export function LogDetail({
  event,
  size,
  severityMeta,
  severityLabel,
}: LogDetailProps) {
  const { key: bodyKey, value: bodyValue } = pickBody(event.attributes);
  const roomy = size === 'roomy';

  const severityNumber =
    event.attributes['severityNumber'] ??
    event.attributes['log.severityNumber'];

  const restAttrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event.attributes)) {
    if (k === bodyKey) continue;
    if (META_KEYS.has(k)) continue;
    restAttrs[k] = v;
  }
  const nestedAttrs = nestDottedKeys(restAttrs);
  const hasAttrs = Object.keys(restAttrs).length > 0;

  return (
    <div className={cn('flex flex-col', roomy ? 'gap-4' : 'gap-3')}>
      {bodyValue !== null && bodyValue !== undefined && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Body
          </p>
          {typeof bodyValue === 'object' ? (
            <JsonTree
              value={bodyValue as object}
              size={size}
              collapsed={false}
            />
          ) : (
            <pre
              className={cn(
                'whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-2 font-mono text-foreground',
                roomy ? 'text-sm' : 'text-xs',
              )}
            >
              {String(bodyValue)}
            </pre>
          )}
        </div>
      )}

      {hasAttrs && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Attributes
          </p>
          <JsonTree value={nestedAttrs} size={size} collapsed={false} />
        </div>
      )}

      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground',
          roomy ? 'text-xs' : 'text-[11px]',
        )}
      >
        {severityMeta && severityLabel && (
          <span className="flex items-center gap-1.5">
            <span
              className={cn('size-1.5 rounded-full', severityMeta.dotClass)}
            />
            <span
              className={cn(
                'font-mono font-semibold uppercase tracking-wider',
                severityMeta.labelClass,
              )}
            >
              {severityLabel}
            </span>
          </span>
        )}
        {typeof severityNumber === 'number' && (
          <span className="font-mono tabular-nums">#{severityNumber}</span>
        )}
        <span className="font-mono tabular-nums">
          {formatTimestamp(event.timestamp)}
        </span>
      </div>
    </div>
  );
}
