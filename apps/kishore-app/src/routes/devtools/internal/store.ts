import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** A package the user has added to DevTools, keyed by its absolute path. */
export type Project = {
  /** Absolute filesystem path of the package directory. */
  path: string;
  /** Optional human-readable label. */
  label?: string;
};

/** The active DevTools tool. otel is global; depcruise is per-project. */
export type DevtoolsTool = 'otel' | 'depcruise';

type State = {
  /** DevTools server base URL (no trailing `/rpc`). Empty until configured. */
  devUrl: string;
  projects: Project[];
  selectedPath: string | null;
  /** Transient: whether the connection-config dialog is open. Not persisted. */
  connectionOpen: boolean;
};

type Actions = {
  setDevUrl: (url: string) => void;
  addProject: (project: Project) => void;
  removeProject: (path: string) => void;
  selectProject: (path: string | null) => void;
  setConnectionOpen: (open: boolean) => void;
};

const INITIAL: State = {
  devUrl: '',
  projects: [],
  selectedPath: null,
  connectionOpen: false,
};

export const useDevtoolsStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...INITIAL,
      setDevUrl: (devUrl) => set({ devUrl }),
      setConnectionOpen: (connectionOpen) => set({ connectionOpen }),
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
