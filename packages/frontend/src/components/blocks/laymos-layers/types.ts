import type { LaymosReport } from 'laymos/report';

export type LaymosNode =
  | { readonly kind: 'graph'; readonly name: string }
  | { readonly kind: 'layer'; readonly name: string };

export interface LaymosLayersProps {
  readonly report: LaymosReport;
  readonly selectedNode: LaymosNode | null;
  readonly onSelectedNodeChange: (node: LaymosNode | null) => void;
  readonly hoveredNode: LaymosNode | null;
  readonly onHoveredNodeChange: (node: LaymosNode | null) => void;
  readonly focusedNode: LaymosNode | null;
  readonly onFocusedNodeChange: (node: LaymosNode | null) => void;
  readonly defaultMinimise?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
}
