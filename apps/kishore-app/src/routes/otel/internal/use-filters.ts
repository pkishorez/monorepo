import { useCallback, useState } from 'react';
import type {
  OtelSpan,
  TraceGroup,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer/otel-trace-viewer';

export type AttributeFilter = { id: string; key: string; value: string };

export type Filters = {
  serviceName: string | null;
  sinceNow: number | null;
  attributeFilters: AttributeFilter[];
};

export function discoverServiceNames(spans: OtelSpan[]): string[] {
  const names = new Set<string>();
  for (const span of spans) {
    const name = span.attributes['resource.service.name'];
    if (typeof name === 'string' && name) names.add(name);
  }
  return Array.from(names).sort();
}

export function discoverAttributeKeys(spans: OtelSpan[]): string[] {
  const keys = new Set<string>();
  for (const span of spans) {
    for (const key of Object.keys(span.attributes)) {
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
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

export function applyFilters(
  traces: TraceGroup[],
  spans: OtelSpan[],
  filters: Filters,
): { visible: TraceGroup[]; hiddenBySinceNow: number } {
  const spansByTrace = new Map<string, OtelSpan[]>();
  for (const span of spans) {
    if (!spansByTrace.has(span.traceId)) spansByTrace.set(span.traceId, []);
    spansByTrace.get(span.traceId)!.push(span);
  }

  let hiddenBySinceNow = 0;
  const visible: TraceGroup[] = [];

  for (const trace of traces) {
    const traceSpans = spansByTrace.get(trace.traceId) ?? [];

    if (filters.serviceName !== null) {
      const rootSpan = traceSpans.find((s) => s.parentSpanId === null);
      if (rootSpan?.attributes['resource.service.name'] !== filters.serviceName)
        continue;
    }

    if (filters.attributeFilters.length > 0) {
      const allMatch = filters.attributeFilters.every((af) =>
        traceSpans.some((s) => String(s.attributes[af.key]) === af.value),
      );
      if (!allMatch) continue;
    }

    if (filters.sinceNow !== null && trace.startTime < filters.sinceNow) {
      hiddenBySinceNow++;
      continue;
    }

    visible.push(trace);
  }

  return { visible, hiddenBySinceNow };
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>({
    serviceName: null,
    sinceNow: null,
    attributeFilters: [],
  });

  const setServiceName = useCallback((serviceName: string | null) => {
    setFilters((f) => ({ ...f, serviceName }));
  }, []);

  const setSinceNow = useCallback((ts: number) => {
    setFilters((f) => ({ ...f, sinceNow: ts }));
  }, []);

  const clearSinceNow = useCallback(() => {
    setFilters((f) => ({ ...f, sinceNow: null }));
  }, []);

  const addAttributeFilter = useCallback((key: string, value: string) => {
    setFilters((f) => ({
      ...f,
      attributeFilters: [
        ...f.attributeFilters,
        { id: crypto.randomUUID(), key, value },
      ],
    }));
  }, []);

  const removeAttributeFilter = useCallback((id: string) => {
    setFilters((f) => ({
      ...f,
      attributeFilters: f.attributeFilters.filter((af) => af.id !== id),
    }));
  }, []);

  return {
    filters,
    setServiceName,
    setSinceNow,
    clearSinceNow,
    addAttributeFilter,
    removeAttributeFilter,
  };
}
