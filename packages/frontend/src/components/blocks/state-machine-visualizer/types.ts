import type { SVGProps } from 'react';

export type StateMachineNodeType =
  | 'atomic'
  | 'compound'
  | 'parallel'
  | 'final'
  | 'history';

export interface SerializedStateMachineNode {
  readonly id: string;
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

export interface StateMachineLayout {
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

export type StateMachineSvgNodeRole =
  | 'initial-indicator'
  | 'initial'
  | 'final'
  | 'intermediate';

export type StateMachineSvgEdgeRole = 'initial-arrow' | 'transition';

export interface StateMachineSvgClassNames {
  readonly node?: (context: {
    readonly role: StateMachineSvgNodeRole;
    readonly node: StateMachineSceneNode;
  }) => string | undefined;
  readonly edge?: (context: {
    readonly role: StateMachineSvgEdgeRole;
    readonly edge: StateMachineSceneEdge;
  }) => string | undefined;
}

export interface StateMachineSvgProps {
  readonly layout: StateMachineLayout;
  readonly className?: string;
  readonly classNames?: StateMachineSvgClassNames;
  readonly ariaLabel?: string;
  readonly padding?: number;
  readonly viewport?: StateMachineViewport;
  readonly svgProps?: Omit<
    SVGProps<SVGSVGElement>,
    'aria-label' | 'className' | 'role' | 'viewBox'
  >;
}

export interface StateMachineSvgInteraction {
  readonly pan?: boolean;
  readonly zoom?: boolean;
  readonly bounded?: boolean;
  readonly minimumVisibleRatio?: number;
  readonly minimumZoom?: number;
  readonly maximumZoom?: number;
}

export interface StateMachineSvgViewerProps {
  readonly layout: StateMachineLayout;
  readonly className?: string;
  readonly classNames?: StateMachineSvgClassNames;
  readonly ariaLabel?: string;
  readonly title?: string;
  readonly showHeader?: boolean;
  readonly interaction?: StateMachineSvgInteraction;
}
