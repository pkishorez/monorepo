import type { LaymosReport } from 'laymos/report';
import type { Viewport } from '@xyflow/react';

export interface LaymosModuleSelection {
  readonly path: string;
  readonly depth: 'direct' | 'transitive';
}

export interface LaymosModulesProps {
  readonly report: LaymosReport;
  readonly selectedModule: LaymosModuleSelection | null;
  readonly onSelectedModuleChange: (
    selection: LaymosModuleSelection | null,
  ) => void;
  readonly hoveredModule: string | null;
  readonly onHoveredModuleChange: (path: string | null) => void;
  readonly focusedModule: string | null;
  readonly onFocusedModuleChange: (path: string | null) => void;
  readonly defaultMinimise?: boolean;
  readonly defaultShowLayerConnections?: boolean;
  readonly initialViewport?: Viewport | undefined;
  readonly onViewportChange?: (viewport: Viewport) => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}
