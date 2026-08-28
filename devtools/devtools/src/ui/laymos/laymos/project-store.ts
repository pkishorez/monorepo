import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type Project = { path: string; label?: string };

type ProjectState = {
  projects: Project[];
  selectedPath: string | null;
  addProject: (project: Project) => void;
  removeProject: (path: string) => void;
  selectProject: (path: string | null) => void;
  reloadNonce: number;
  requestReload: () => void;
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: [],
      selectedPath: null,
      addProject: (project) =>
        set((state) =>
          state.projects.some(({ path }) => path === project.path)
            ? state
            : { projects: [...state.projects, project] },
        ),
      removeProject: (path) =>
        set((state) => ({
          projects: state.projects.filter((project) => project.path !== path),
          selectedPath: state.selectedPath === path ? null : state.selectedPath,
        })),
      selectProject: (selectedPath) => set({ selectedPath }),
      reloadNonce: 0,
      requestReload: () =>
        set((state) => ({ reloadNonce: state.reloadNonce + 1 })),
    }),
    {
      name: 'laymos:projects',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ projects, selectedPath }) =>
        ({ projects, selectedPath }) as ProjectState,
    },
  ),
);
