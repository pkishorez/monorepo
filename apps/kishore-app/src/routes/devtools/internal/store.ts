import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** A package the user has added to DevTools, keyed by its absolute path. */
export type Project = {
  /** Absolute filesystem path of the package directory. */
  path: string;
  /** Optional human-readable label. */
  label?: string;
};

type State = {
  /** DevTools server base URL (no trailing `/rpc`). */
  devUrl: string;
  projects: Project[];
  selectedPath: string | null;
};

type Actions = {
  setDevUrl: (url: string) => void;
  addProject: (project: Project) => void;
  removeProject: (path: string) => void;
  selectProject: (path: string | null) => void;
};

const DEFAULT_DEV_URL = 'http://127.0.0.1:14400';

const INITIAL: State = {
  devUrl: DEFAULT_DEV_URL,
  projects: [],
  selectedPath: null,
};

export const useDevtoolsStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...INITIAL,
      setDevUrl: (devUrl) => set({ devUrl }),
      addProject: (project) =>
        set((s) =>
          s.projects.some((p) => p.path === project.path)
            ? s
            : { projects: [...s.projects, project] },
        ),
      removeProject: (path) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.path !== path),
          selectedPath: s.selectedPath === path ? null : s.selectedPath,
        })),
      selectProject: (selectedPath) => set({ selectedPath }),
    }),
    {
      name: 'devtools:data',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        devUrl: s.devUrl,
        projects: s.projects,
        selectedPath: s.selectedPath,
      }),
    },
  ),
);

export function isValidBaseUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
