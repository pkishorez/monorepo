import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MergedTransaction } from '@/orchestration';

type GroupBy = 'category' | 'bank' | 'type';
type Granularity = 'day' | 'month';
type ActiveTab = 'chart' | 'table';

interface DashboardStore {
  groupBy: GroupBy;
  granularityOverride: Granularity | null;
  activeTab: ActiveTab;
  selectedMonth: string | null;
  tableSort: { key: string; direction: 'asc' | 'desc' } | null;
  tablePageSize: number;
  tablePage: number;
  editingTxn: (MergedTransaction & { resolvedType: string }) | null;

  setGroupBy: (groupBy: GroupBy) => void;
  setGranularityOverride: (g: Granularity | null) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setSelectedMonth: (month: string | null) => void;
  setTableSort: (
    sort: { key: string; direction: 'asc' | 'desc' } | null,
  ) => void;
  setTablePageSize: (size: number) => void;
  setTablePage: (page: number) => void;
  setEditingTxn: (
    txn: (MergedTransaction & { resolvedType: string }) | null,
  ) => void;
}

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      groupBy: 'category',
      granularityOverride: null,
      activeTab: 'chart',
      selectedMonth: null,
      tableSort: null,
      tablePageSize: 25,
      tablePage: 0,
      editingTxn: null,

      setGroupBy: (groupBy) => set({ groupBy }),
      setGranularityOverride: (granularityOverride) =>
        set({ granularityOverride }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
      setTableSort: (tableSort) => set({ tableSort }),
      setTablePageSize: (tablePageSize) => set({ tablePageSize }),
      setTablePage: (tablePage) => set({ tablePage }),
      setEditingTxn: (editingTxn) => set({ editingTxn }),
    }),
    {
      name: 'finances:dashboard',
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        groupBy,
        granularityOverride,
        activeTab,
        selectedMonth,
        tableSort,
        tablePageSize,
      }) => ({
        groupBy,
        granularityOverride,
        activeTab,
        selectedMonth,
        tableSort,
        tablePageSize,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<DashboardStore>),
      }),
    },
  ),
);
