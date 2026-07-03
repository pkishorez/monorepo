import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AttributeFilter = { id: string; key: string; value: string };

export type TraceStatusFilter = 'all' | 'error' | 'running';

export type Filters = {
  attributeFilters: AttributeFilter[];
  sinceNow: number | null;
  status: TraceStatusFilter;
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

/**
 * Trace-list column widths keyed by column name so the preference is shared
 * across every trace-list view (grouped or flat) and survives reloads.
 */
export type ColumnWidths = Record<string, number>;

type State = {
  filters: Filters;
  traceList: TraceListSettings;
  dock: DockSettings;
  palette: PaletteSettings;
  columnWidths: ColumnWidths;
  /** Whether the service navigation rail is collapsed to a thin strip. */
  railCollapsed: boolean;
  /** Width (px) of the expanded service navigation rail. */
  railWidth: number;
};

type Actions = {
  setFilters: (next: Filters) => void;
  setTraceList: (next: TraceListSettings) => void;
  setDock: (next: DockSettings) => void;
  setPalette: (next: PaletteSettings) => void;
  setColumnWidth: (name: string, width: number) => void;
  setRailCollapsed: (next: boolean) => void;
  setRailWidth: (next: number) => void;
};

const INITIAL: State = {
  filters: { attributeFilters: [], sinceNow: null, status: 'all' },
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
  columnWidths: {},
  railCollapsed: false,
  railWidth: 256,
};

export const useLotelStore = create<State & Actions>()(
  persist(
    (set) => ({
      ...INITIAL,
      setFilters: (filters) => set({ filters }),
      setTraceList: (traceList) => set({ traceList }),
      setDock: (dock) => set({ dock }),
      setPalette: (palette) => set({ palette }),
      setColumnWidth: (name, width) =>
        set((s) => ({
          columnWidths: { ...s.columnWidths, [name]: width },
        })),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      setRailWidth: (railWidth) => set({ railWidth }),
    }),
    {
      name: 'lotel:data',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        filters: s.filters,
        traceList: s.traceList,
        dock: s.dock,
        palette: s.palette,
        columnWidths: s.columnWidths,
        railCollapsed: s.railCollapsed,
        railWidth: s.railWidth,
      }),
    },
  ),
);
