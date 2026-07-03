import type {
  OtelSpan,
  TraceGroup,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer';
import type { Filters } from './store';

export const SERVICE_ATTR_KEY = 'resource.service.name';
export const NO_ROOT_SERVICE = '__no_root__';
export const NO_ROOT_LABEL = '(no root)';

export function effectiveService(trace: TraceGroup): string | null {
  if (trace.missingRoot) return NO_ROOT_SERVICE;
  return trace.serviceName;
}

export function formatServiceName(name: string): string {
  return name === NO_ROOT_SERVICE ? NO_ROOT_LABEL : name;
}

/** Human-readable "time since" a wall-clock timestamp (ms). */
export function formatRelativeTime(ts: number): string {
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 0) return 'now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function discoverAttributeKeys(spans: OtelSpan[]): string[] {
  const keys = new Set<string>();
  for (const span of spans) {
    for (const key of Object.keys(span.attributes)) keys.add(key);
  }
  return Array.from(keys)
    .filter((k) => k !== SERVICE_ATTR_KEY)
    .sort();
}

export type ServiceInsight = {
  name: string;
  traceCount: number;
  errorCount: number;
  spanCount: number;
  p50: number | null;
  p99: number | null;
  lastSeen: number;
  topTraceNames: { name: string; count: number }[];
};

export function computeServiceInsights(traces: TraceGroup[]): ServiceInsight[] {
  const byService = new Map<string, TraceGroup[]>();
  for (const t of traces) {
    const svc = effectiveService(t);
    if (!svc) continue;
    let arr = byService.get(svc);
    if (!arr) {
      arr = [];
      byService.set(svc, arr);
    }
    arr.push(t);
  }

  const insights: ServiceInsight[] = [];
  for (const [name, list] of byService) {
    const durations: number[] = [];
    let errorCount = 0;
    let spanCount = 0;
    let lastSeen = -Infinity;
    const nameCounts = new Map<string, number>();

    for (const t of list) {
      if (t.status === 'error') errorCount++;
      spanCount += t.spanCount;
      if (t.duration !== null) durations.push(t.duration);
      if (t.lastActivity > lastSeen) lastSeen = t.lastActivity;
      nameCounts.set(t.name, (nameCounts.get(t.name) ?? 0) + 1);
    }

    durations.sort((a, b) => a - b);

    const topTraceNames = Array.from(nameCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, count]) => ({ name: n, count }));

    insights.push({
      name,
      traceCount: list.length,
      errorCount,
      spanCount,
      p50: percentile(durations, 0.5),
      p99: percentile(durations, 0.99),
      lastSeen,
      topTraceNames,
    });
  }

  return insights.sort((a, b) => b.traceCount - a.traceCount);
}

export function discoverAttributeValues(
  spans: OtelSpan[],
  key: string,
): string[] {
  const values = new Set<string>();
  for (const span of spans) {
    const val = span.attributes[key];
    if (val !== undefined && val !== null) values.add(String(val));
  }
  return Array.from(values).sort();
}

/**
 * AND across keys, OR within the same key.
 */
export function applyFilters(
  traces: TraceGroup[],
  spans: OtelSpan[],
  filters: Filters,
): { visible: TraceGroup[]; hiddenBySinceNow: number } {
  const spansByTrace = new Map<string, OtelSpan[]>();
  for (const span of spans) {
    let arr = spansByTrace.get(span.traceId);
    if (!arr) {
      arr = [];
      spansByTrace.set(span.traceId, arr);
    }
    arr.push(span);
  }

  const filtersByKey = new Map<string, string[]>();
  for (const f of filters.attributeFilters) {
    let arr = filtersByKey.get(f.key);
    if (!arr) {
      arr = [];
      filtersByKey.set(f.key, arr);
    }
    arr.push(f.value);
  }

  const serviceValues = filtersByKey.get(SERVICE_ATTR_KEY);
  const statusFilter = filters.status ?? 'all';

  let hiddenBySinceNow = 0;
  const visible: TraceGroup[] = [];

  for (const trace of traces) {
    if (serviceValues) {
      const svc = effectiveService(trace);
      if (svc === null || !serviceValues.includes(svc)) continue;
    }

    if (statusFilter === 'error' && trace.status !== 'error') continue;
    if (statusFilter === 'running' && trace.status !== 'running') continue;

    const traceSpans = spansByTrace.get(trace.traceId) ?? [];

    let matchesAttrs = true;
    for (const [key, values] of filtersByKey) {
      if (key === SERVICE_ATTR_KEY) continue;
      const ok = traceSpans.some((s) => {
        const v = s.attributes[key];
        return v !== undefined && values.includes(String(v));
      });
      if (!ok) {
        matchesAttrs = false;
        break;
      }
    }
    if (!matchesAttrs) continue;

    if (filters.sinceNow !== null && trace.startTime < filters.sinceNow) {
      hiddenBySinceNow++;
      continue;
    }

    visible.push(trace);
  }

  return { visible, hiddenBySinceNow };
}

export type TraceNameGroup = {
  name: string;
  traces: TraceGroup[];
  count: number;
  errorCount: number;
  services: string[];
  p50: number | null;
  p99: number | null;
};

export const GROUP_BY_TRACE_NAME = '__trace_name__';
export const GROUP_NONE_LABEL = '(none)';

export function groupTracesBy(
  traces: TraceGroup[],
  spans: OtelSpan[],
  groupBy: string,
): TraceNameGroup[] {
  if (groupBy === GROUP_BY_TRACE_NAME) {
    return groupByTraceName(traces);
  }

  const valueByTrace = new Map<string, string>();
  for (const span of spans) {
    if (valueByTrace.has(span.traceId)) continue;
    const v = span.attributes[groupBy];
    if (v !== undefined && v !== null) {
      valueByTrace.set(span.traceId, String(v));
    }
  }

  const byValue = new Map<string, TraceGroup[]>();
  for (const t of traces) {
    const key = valueByTrace.get(t.traceId) ?? GROUP_NONE_LABEL;
    let arr = byValue.get(key);
    if (!arr) {
      arr = [];
      byValue.set(key, arr);
    }
    arr.push(t);
  }

  return buildNameGroups(byValue);
}

export function groupByTraceName(traces: TraceGroup[]): TraceNameGroup[] {
  const byName = new Map<string, TraceGroup[]>();
  for (const t of traces) {
    let arr = byName.get(t.name);
    if (!arr) {
      arr = [];
      byName.set(t.name, arr);
    }
    arr.push(t);
  }
  return buildNameGroups(byName);
}

function buildNameGroups(byName: Map<string, TraceGroup[]>): TraceNameGroup[] {
  const groups: TraceNameGroup[] = [];
  for (const [name, list] of byName) {
    const durations: number[] = [];
    let errorCount = 0;
    const services = new Set<string>();
    let latestStart = -Infinity;

    for (const t of list) {
      if (t.status === 'error') errorCount++;
      if (t.serviceName) services.add(t.serviceName);
      if (t.duration !== null) durations.push(t.duration);
      if (t.startTime > latestStart) latestStart = t.startTime;
    }

    durations.sort((a, b) => a - b);

    groups.push({
      name,
      traces: list,
      count: list.length,
      errorCount,
      services: Array.from(services).sort(),
      p50: percentile(durations, 0.5),
      p99: percentile(durations, 0.99),
    });
  }

  groups.sort((a, b) => latestStartOf(b) - latestStartOf(a));
  return groups;
}

function latestStartOf(g: TraceNameGroup): number {
  let max = -Infinity;
  for (const t of g.traces) if (t.startTime > max) max = t.startTime;
  return max;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * sorted.length)),
  );
  return sorted[idx]!;
}
