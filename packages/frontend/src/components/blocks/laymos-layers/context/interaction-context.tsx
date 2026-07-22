import { createContext, useContext, type ReactNode } from 'react';

import type { LaymosLayersProps, LaymosNode } from '../types';

type InteractionContextValue = Pick<
  LaymosLayersProps,
  | 'selectedNode'
  | 'onSelectedNodeChange'
  | 'hoveredNode'
  | 'onHoveredNodeChange'
  | 'focusedNode'
  | 'onFocusedNodeChange'
>;

const InteractionContext = createContext<InteractionContextValue | null>(null);

export function InteractionProvider({
  children,
  ...value
}: InteractionContextValue & { readonly children: ReactNode }) {
  return (
    <InteractionContext.Provider value={value}>
      {children}
    </InteractionContext.Provider>
  );
}

function sameNode(left: LaymosNode | null, right: LaymosNode): boolean {
  return left?.kind === right.kind && left.name === right.name;
}

export function useNodeInteractions(node: LaymosNode) {
  const interaction = useContext(InteractionContext);
  if (!interaction) {
    throw new Error('Laymos layer nodes require an InteractionProvider');
  }

  return {
    selected: sameNode(interaction.selectedNode, node),
    hovered: sameNode(interaction.hoveredNode, node),
    focused: sameNode(interaction.focusedNode, node),
    onFocus: () => interaction.onFocusedNodeChange(node),
    onBlur: () => interaction.onFocusedNodeChange(null),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      interaction.onSelectedNodeChange(null);
    },
  };
}
