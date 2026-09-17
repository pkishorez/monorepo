import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Monorepo = { path: string; label?: string };

type MonorepoState = {
  monorepos: Monorepo[];
  selectedPath: string | null;
  addMonorepo: (monorepo: Monorepo) => void;
  removeMonorepo: (path: string) => void;
  selectMonorepo: (path: string | null) => void;
  reloadNonce: number;
  requestReload: () => void;
};

export const useMonorepoStore = create<MonorepoState>()(
  persist(
    (set) => ({
      monorepos: [],
      selectedPath: null,
      addMonorepo: (monorepo) =>
        set((state) =>
          state.monorepos.some(({ path }) => path === monorepo.path)
            ? state
            : { monorepos: [...state.monorepos, monorepo] },
        ),
      removeMonorepo: (path) =>
        set((state) => ({
          monorepos: state.monorepos.filter(
            (monorepo) => monorepo.path !== path,
          ),
          selectedPath: state.selectedPath === path ? null : state.selectedPath,
        })),
      selectMonorepo: (selectedPath) => set({ selectedPath }),
      reloadNonce: 0,
      requestReload: () =>
        set((state) => ({ reloadNonce: state.reloadNonce + 1 })),
    }),
    {
      name: 'monoverse:monorepos',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ monorepos, selectedPath }) =>
        ({ monorepos, selectedPath }) as MonorepoState,
    },
  ),
);
