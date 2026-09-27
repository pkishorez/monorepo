import type { SVGProps } from 'react';

export type StateMachineNodeType =
  | 'atomic'
  | 'compound'
  | 'parallel'
  | 'final'
  | 'history'
  | 'choice';

export interface SerializedStateMachineNode {
  readonly id: string;
  readonly path: readonly string[];
  readonly label: string;
  readonly description?: string;
  readonly type: StateMachineNodeType;
  readonly parentId?: string;
  readonly initial: boolean;
}

export interface SerializedStateMachineEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

export interface SerializedStateMachine {
  readonly id: string;
  readonly label: string;
  readonly nodes: readonly SerializedStateMachineNode[];
  readonly edges: readonly SerializedStateMachineEdge[];
}

export interface StateMachinePoint {
  readonly x: number;
  readonly y: number;
}

export interface StateMachineSceneNode {
  readonly id: string;
  readonly path?: readonly string[];
  readonly parentId?: string;
  readonly kind: 'state' | 'initial';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly description?: string;
  readonly type?: StateMachineNodeType;
  readonly initial?: boolean;
  readonly container?: boolean;
}

export interface StateMachineSceneEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sections: readonly StateMachineSceneEdgeSection[];
  readonly initial: boolean;
  readonly label?: string;
  readonly labelWidth?: number;
  readonly labelHeight?: number;
  readonly labelX?: number;
  readonly labelY?: number;
}

export interface StateMachineSceneEdgeSection {
  readonly points: readonly StateMachinePoint[];
  readonly target: boolean;
}

export interface StateMachineDiagram {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly StateMachineSceneNode[];
  readonly edges: readonly StateMachineSceneEdge[];
}

export interface StateMachineViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type StateMachineWrappingStrategy = 'OFF' | 'SINGLE_EDGE' | 'MULTI_EDGE';

export interface StateMachineLayoutOptions {
  readonly aspectRatio?: number;
  readonly wrappingStrategy?: StateMachineWrappingStrategy;
}

export type StateMachineNodeRole =
  | 'initial-indicator'
  | 'initial'
  | 'final'
  | 'choice'
  | 'intermediate';

export type StateMachineEdgeRole = 'initial-arrow' | 'transition';

export type StateMachineStateValue =
  | string
  | { readonly [key: string]: StateMachineStateValue };

export type StateMachineFocus =
  | { readonly mode: 'click' }
  | {
      readonly mode: 'highlight';
      readonly nodeId: string;
      readonly follow?: boolean;
    }
  | {
      readonly mode: 'active-state';
      readonly value: StateMachineStateValue;
      readonly follow?: boolean;
    }
  | { readonly mode: 'none' };

export type StateMachineHighlight =
  | { readonly kind: 'idle' }
  | { readonly kind: 'focused' }
  | {
      readonly kind: 'connected';
      readonly direction: 'outgoing';
    }
  | { readonly kind: 'dimmed' };

export interface StateMachineClassNames {
  readonly node?: (context: {
    readonly role: StateMachineNodeRole;
    readonly node: StateMachineSceneNode;
    readonly highlight: StateMachineHighlight;
  }) => string | undefined;
  readonly edge?: (context: {
    readonly role: StateMachineEdgeRole;
    readonly edge: StateMachineSceneEdge;
    readonly highlight: StateMachineHighlight;
  }) => string | undefined;
}

export interface StateMachineSvgProps {
  readonly diagram: StateMachineDiagram;
  readonly className?: string;
  readonly classNames?: StateMachineClassNames;
  readonly padding?: number;
  readonly viewport?: StateMachineViewport;
  readonly svgProps?: Omit<
    SVGProps<SVGSVGElement>,
    'aria-label' | 'className' | 'role' | 'viewBox'
  >;
  readonly nodeHighlights?: ReadonlyMap<string, StateMachineHighlight>;
  readonly edgeHighlights?: ReadonlyMap<string, StateMachineHighlight>;
  readonly onNodeSelect?: (node: StateMachineSceneNode) => void;
  readonly onConnectedNodeHover?: (nodeId: string | undefined) => void;
  readonly onClearFocus?: () => void;
}

export interface StateMachineNavigation {
  readonly pan?: boolean;
  readonly zoom?: boolean;
  readonly bounded?: boolean;
  readonly minimumVisibleRatio?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

export interface StateMachineViewerProps {
  readonly diagram: StateMachineDiagram;
  readonly className?: string;
  readonly classNames?: StateMachineClassNames;
  readonly showHeader?: boolean;
  readonly focus?: StateMachineFocus;
  readonly navigation?: StateMachineNavigation;
}
