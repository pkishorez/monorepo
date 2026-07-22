import { createContext, useContext, type ReactNode } from 'react';

import type { LaymosModuleSelection } from '../types';

interface ModuleGraphInteraction {
  readonly selectedModule: LaymosModuleSelection | null;
  readonly onSelectedModuleChange: (
    selection: LaymosModuleSelection | null,
  ) => void;
  readonly onHoveredModuleChange: (path: string | null) => void;
  readonly onFocusedModuleChange: (path: string | null) => void;
}

const ModuleGraphInteractionContext =
  createContext<ModuleGraphInteraction | null>(null);

export function ModuleGraphInteractionProvider({
  children,
  ...value
}: ModuleGraphInteraction & { readonly children: ReactNode }) {
  return (
    <ModuleGraphInteractionContext.Provider value={value}>
      {children}
    </ModuleGraphInteractionContext.Provider>
  );
}

export function useModuleGraphInteraction(): ModuleGraphInteraction {
  const interaction = useContext(ModuleGraphInteractionContext);
  if (!interaction) {
    throw new Error(
      'Module graph nodes require a ModuleGraphInteractionProvider',
    );
  }
  return interaction;
}
