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

type State = {
  filters: Filters;
  traceList: TraceListSettings;
  dock: DockSettings;
  palette: PaletteSettings;
};

type Actions = {
  setFilters: (next: Filters) => void;
  setTraceList: (next: TraceListSettings) => void;
  setDock: (next: DockSettings) => void;
  setPalette: (next: PaletteSettings) => void;
};

const INITIAL: State = {
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
      setFilters: (filters) => set({ filters }),
      setTraceList: (traceList) => set({ traceList }),
      setDock: (dock) => set({ dock }),
      setPalette: (palette) => set({ palette }),
    }),
    {
      name: 'lotel:data',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        filters: s.filters,
        traceList: s.traceList,
        dock: s.dock,
        palette: s.palette,
      }),
    },
  ),
);
