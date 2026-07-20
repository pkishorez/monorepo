import { createContext, useContext, type ReactNode } from 'react';

import type { LaymosModulesProps } from '../types';

type InteractionContextValue = Pick<
  LaymosModulesProps,
  | 'selectedModule'
  | 'onSelectedModuleChange'
  | 'hoveredModule'
  | 'onHoveredModuleChange'
  | 'focusedModule'
  | 'onFocusedModuleChange'
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

export function useModuleInteractions(path: string) {
  const interaction = useContext(InteractionContext);
  if (!interaction) {
    throw new Error('Laymos module nodes require an InteractionProvider');
  }
  return {
    hovered: interaction.hoveredModule === path,
    focused: interaction.focusedModule === path,
    onFocus: () => interaction.onFocusedModuleChange(path),
    onBlur: () => interaction.onFocusedModuleChange(null),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      interaction.onSelectedModuleChange(null);
    },
  };
}
