import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { cn } from '#lib/utils';

import type { DependencyGraph, Edge, Module } from './types';

type Direction = 'bottom-to-top' | 'top-to-bottom' | 'left-to-right';
type EdgePath = { d: string; from: string; to: string; status: Edge['status'] };

type Props = {
  graph: DependencyGraph;
  direction?: Direction;
};

function buildPath(fr: DOMRect, tr: DOMRect, cr: DOMRect): string {
  const fcx = fr.left + fr.width / 2 - cr.left;
  const fcy = fr.top + fr.height / 2 - cr.top;
  const tcx = tr.left + tr.width / 2 - cr.left;
  const tcy = tr.top + tr.height / 2 - cr.top;

  if (Math.abs(fcy - tcy) >= Math.abs(fcx - tcx)) {
    const sy = fcy < tcy ? fr.bottom - cr.top : fr.top - cr.top;
    const ty = fcy < tcy ? tr.top - cr.top : tr.bottom - cr.top;
    const my = (sy + ty) / 2;
    return `M ${fcx} ${sy} C ${fcx} ${my}, ${tcx} ${my}, ${tcx} ${ty}`;
  }

  const sx = fcx < tcx ? fr.right - cr.left : fr.left - cr.left;
  const tx = fcx < tcx ? tr.left - cr.left : tr.right - cr.left;
  const mx = (sx + tx) / 2;
  return `M ${sx} ${fcy} C ${mx} ${fcy}, ${mx} ${tcy}, ${tx} ${tcy}`;
}

export function DependencyCruiserViz({
  graph,
  direction = 'bottom-to-top',
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<EdgePath[]>([]);

  const connected = useMemo(() => {
    if (!hovered) return null;
    const s = new Set([hovered]);
    for (const e of graph.edges) {
      if (e.from === hovered) s.add(e.to);
      if (e.to === hovered) s.add(e.from);
    }
    return s;
  }, [hovered, graph.edges]);

  const connectedLayers = useMemo(() => {
    if (!connected) return null;
    const layers = new Set<number>();
    for (const id of connected) {
      const mod = graph.modules.find((m) => m.id === id);
      if (mod) layers.add(mod.layer);
    }
    return layers;
  }, [connected, graph.modules]);

  const colorOf = (id: number) =>
    graph.layers.find((l) => l.id === id)?.color ??
    `var(--chart-${(id % 5) + 1})`;

  const orderedLayers = useMemo(() => {
    const sorted = [...graph.layers].sort((a, b) => a.id - b.id);
    return direction === 'bottom-to-top' ? sorted.toReversed() : sorted;
  }, [graph.layers, direction]);

  const byLayer = useMemo(() => {
    const m = new Map<number, Module[]>();
    for (const l of graph.layers) m.set(l.id, []);
    for (const mod of graph.modules) m.get(mod.layer)?.push(mod);
    return m;
  }, [graph.layers, graph.modules]);

  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const result: EdgePath[] = [];
    for (const edge of graph.edges) {
      const f = nodeRefs.current.get(edge.from);
      const t = nodeRefs.current.get(edge.to);
      if (!f || !t) continue;
      result.push({
        d: buildPath(f.getBoundingClientRect(), t.getBoundingClientRect(), cr),
        from: edge.from,
        to: edge.to,
        status: edge.status,
      });
    }
    setPaths(result);
  }, [graph, direction]);

  const active = connected !== null;
  const dim = (id: string) => active && !connected.has(id);
  const layerDim = (layerId: number) =>
    connectedLayers !== null && !connectedLayers.has(layerId);
  const edgeVisible = (e: EdgePath) =>
    !active || (connected.has(e.from) && connected.has(e.to));

  const onPointerMove = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-module]');
    setHovered(el?.dataset.module ?? null);
  };

  const renderNode = (mod: Module) => (
    <div
      key={mod.id}
      ref={(el) => {
        if (el) nodeRefs.current.set(mod.id, el);
        else nodeRefs.current.delete(mod.id);
      }}
      data-module={mod.id}
      className={cn(
        'cursor-default rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-all duration-200',
        dim(mod.id) ? 'opacity-[0.07]' : 'opacity-100',
        hovered === mod.id && 'ring-2 ring-foreground/25 shadow-lg',
      )}
      style={{
        borderLeftColor: colorOf(mod.layer),
        borderLeftWidth: 3,
      }}
    >
      {mod.label}
      {mod.description && (
        <p className="text-muted-foreground mt-1 text-xs font-normal">
          {mod.description}
        </p>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHovered(null)}
    >
      <div className="flex flex-col gap-14 px-4 py-8">
        {orderedLayers.map((layer) => (
          <div key={layer.id}>
            <div
              className={cn(
                'mb-4 text-[11px] font-semibold uppercase tracking-widest transition-opacity duration-200',
                layerDim(layer.id) && 'opacity-[0.07]',
              )}
              style={{ color: colorOf(layer.id) }}
            >
              {layer.label}
            </div>
            <div className="flex flex-wrap gap-5">
              {(byLayer.get(layer.id) ?? []).map((mod) => renderNode(mod))}
            </div>
          </div>
        ))}
      </div>

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker
            id="dcv-arrow"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0.5 L 9 4 L 0 7.5" fill="context-stroke" />
          </marker>
        </defs>
        {paths.map((p, i) => {
          const visible = edgeVisible(p);
          const violated = p.status === 'violated';
          return (
            <path
              key={i}
              d={p.d}
              fill="none"
              strokeWidth={violated ? 2 : active && visible ? 2.5 : 1.5}
              strokeDasharray={violated ? '6 3' : undefined}
              markerEnd="url(#dcv-arrow)"
              className={cn(
                'transition-all duration-200',
                violated
                  ? 'stroke-red-500'
                  : active && visible
                    ? 'stroke-foreground/50'
                    : 'stroke-muted-foreground/25',
                active && !visible && 'opacity-0',
              )}
            />
          );
        })}
      </svg>
    </div>
  );
}
