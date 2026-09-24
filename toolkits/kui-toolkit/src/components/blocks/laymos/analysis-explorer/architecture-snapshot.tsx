import { useCallback, useMemo, useState } from 'react';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { cn } from '#lib/utils';

import {
  buildPresentationModel,
  changedArchitecture,
} from '../analysis-presentation';
import { ModuleGraph, ModuleLegend } from '../module-inspection';

// fitView pads the canvas by this fraction of the drawing on each axis, so a
// canvas this much larger than its content shows it at zoom 1.
const fitPadding = 0.16;
const minWidth = 480;
const minHeight = 240;

export interface SnapshotSize {
  readonly width: number;
  readonly height: number;
}

export interface ArchitectureSnapshotProps {
  readonly analysis: ArchitectureAnalysis;
  readonly changes?: ChangeSet;
  /**
   * Draw every Module. Otherwise only the changed ones and their Layers are
   * drawn, and everything is drawn when no analyzed Module changed.
   */
  readonly includeUnchanged?: boolean;
  /** Largest canvas, in CSS pixels; a bigger drawing is scaled down to fit. */
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  /** Shown above the drawing, usually the Project's name. */
  readonly title?: string;
  /** How the caption names the Base ref; defaults to the Change set's ref. */
  readonly baseLabel?: string;
  /**
   * Called when the drawing has settled at its final size. The canvas size is
   * the graph alone; the caller measures the whole element.
   */
  readonly onReady?: (canvas: SnapshotSize) => void;
  readonly className?: string;
}

/**
 * A still Module graph sized to its content: what a screenshot of a Project's
 * architecture should show. The canvas is measured once at the largest size,
 * then redrawn at the size the content needs, capped at `maxWidth` by
 * `maxHeight`, so a small change makes a small picture and a large one is
 * scaled down instead of cropped.
 */
export function ArchitectureSnapshot({
  analysis,
  changes,
  includeUnchanged = false,
  maxWidth = 1600,
  maxHeight = 1600,
  title,
  baseLabel,
  onReady,
  className,
}: ArchitectureSnapshotProps) {
  const model = useMemo(
    () => buildPresentationModel(analysis, changes),
    [analysis, changes],
  );
  const changed = useMemo(
    () => (includeUnchanged ? undefined : changedArchitecture(model)),
    [model, includeUnchanged],
  );
  const layers = changed?.layers ?? model.layers;
  const layerGraphs = changed?.layerGraphs ?? model.layerGraphs;
  const modules = changed?.modules ?? model.modules;
  const moduleGraphs = changed?.moduleGraphs ?? model.moduleGraphs;
  const changedCount = model.modules.filter(
    ({ changeStatus }) => changeStatus !== undefined,
  ).length;

  const [size, setSize] = useState<SnapshotSize>();
  const measuring = size === undefined;
  const handleFitted = useCallback(
    (bounds: SnapshotSize) => {
      if (measuring) {
        setSize(canvasSize(bounds, maxWidth, maxHeight));
        return;
      }
      onReady?.(size);
    },
    [measuring, size, maxWidth, maxHeight, onReady],
  );
  const canvas = size ?? { width: maxWidth, height: maxHeight };

  return (
    <div
      className={cn(
        'inline-flex flex-col gap-2 bg-background p-4 text-foreground',
        className,
      )}
      style={{ width: canvas.width + 32 }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-xs">
        <span className="min-w-0 truncate font-semibold">
          {title ?? 'laymos'}
        </span>
        <span className="text-muted-foreground">
          {changes === undefined
            ? `${model.modules.length} modules`
            : `${changedCount} of ${model.modules.length} modules changed since ${shortRef(baseLabel ?? changes.baseRef)}`}
        </span>
      </div>
      <ModuleGraph
        key={measuring ? 'measure' : 'final'}
        className="shrink-0"
        style={{ width: canvas.width, height: canvas.height }}
        layers={layers}
        rules={model.rules}
        layerGraphs={layerGraphs}
        modules={modules}
        moduleGraphs={moduleGraphs}
        dependencies={model.moduleDependencies}
        showLayerConnections
        showModuleConnections
        interactive={false}
        onFitted={handleFitted}
      />
      <ModuleLegend />
    </div>
  );
}

// A full commit hash reads better abbreviated; a ref name stays as written.
function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}

// The size a canvas needs to draw `bounds` at zoom 1 with fitView's padding,
// scaled down uniformly when it would exceed the caps.
function canvasSize(
  bounds: SnapshotSize,
  maxWidth: number,
  maxHeight: number,
): SnapshotSize {
  const width = Math.max(minWidth, Math.ceil(bounds.width * (1 + fitPadding)));
  const height = Math.max(
    minHeight,
    Math.ceil(bounds.height * (1 + fitPadding)),
  );
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
