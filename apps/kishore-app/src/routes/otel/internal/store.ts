import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AttributeFilter = { id: string; key: string; value: string };

export type Filters = {
  attributeFilters: AttributeFilter[];
  sinceNow: number | null;
};

export type TraceListSettings = {
  groupBy: string | null;
  expandedGroups: Record<string, boolean>;
  selectedTraceId: string | null;
};

export type DockSettings = {
  open: boolean;
  height: number;
  sidebarWidth: number;
  nameColWidth: number;
  sidebarOpen: boolean;
  selectedSpanId: string | null;
};

export type PaletteSettings = {
  open: boolean;
};

export type Config = {
  baseUrl: string | null;
};

type State = {
  config: Config;
  filters: Filters;
  traceList: TraceListSettings;
  dock: DockSettings;
  palette: PaletteSettings;
};

type Actions = {
  setConfig: (next: Config) => void;
  setFilters: (next: Filters) => void;
  setTraceList: (next: TraceListSettings) => void;
  setDock: (next: DockSettings) => void;
  setPalette: (next: PaletteSettings) => void;
};

const INITIAL: State = {
  config: { baseUrl: null },
  filters: { attributeFilters: [], sinceNow: null },
  traceList: {
    groupBy: null,
    expandedGroups: {},
    selectedTraceId: null,
  },
  dock: {
    open: false,
    height: 300,
    sidebarWidth: 360,
    nameColWidth: 248,
    sidebarOpen: true,
    selectedSpanId: null,
  },
  palette: { open: false },
};

export const useLotelStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...INITIAL,
      setConfig: (config) => set({ config }),
      setFilters: (filters) => set({ filters }),
      setTraceList: (traceList) => set({ traceList }),
      setDock: (dock) => set({ dock }),
      setPalette: (palette) => set({ palette }),
    }),
    {
      name: 'lotel:data',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        config: s.config,
        filters: s.filters,
        traceList: s.traceList,
        dock: s.dock,
        palette: s.palette,
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
