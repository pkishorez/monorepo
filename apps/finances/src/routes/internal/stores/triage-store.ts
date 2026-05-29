import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type TriageTab = 'all' | 'unresolved' | 'resolved' | 'ignored';
type CancelTab = 'cancel-out' | 'cancelled';
type SortKey = 'amount' | 'date';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

interface AmountRange {
  min: string;
  max: string;
}

const DEFAULT_SORT: SortConfig = { key: 'amount', direction: 'desc' };
const DEFAULT_PAGE_SIZE = 50;

interface TriageStore {
  activeTriageTab: TriageTab;
  activeCancelTab: CancelTab | null;
  bankFilters: string[];
  categoryFilters: string[];
  ownerFilters: string[];
  amountRange: AmountRange;
  sort: SortConfig;
  search: string;
  pageSize: number;
  notesOpenId: string | null;
  page: number;
  selectedIds: Set<string>;

  setActiveTriageTab: (tab: TriageTab) => void;
  setActiveCancelTab: (tab: CancelTab | null) => void;
  setBankFilters: (filters: string[]) => void;
  setCategoryFilters: (filters: string[]) => void;
  setOwnerFilters: (filters: string[]) => void;
  setAmountRange: (range: AmountRange) => void;
  setSort: (sort: SortConfig) => void;
  setSearch: (search: string) => void;
  setPageSize: (size: number) => void;
  setNotesOpenId: (id: string | null) => void;
  setPage: (page: number) => void;
  setSelectedIds: (ids: Set<string>) => void;
  resetFilters: () => void;
}

export const useTriageStore = create<TriageStore>()(
  persist(
    (set) => ({
      activeTriageTab: 'unresolved',
      activeCancelTab: null,
      bankFilters: [],
      categoryFilters: [],
      ownerFilters: [],
      amountRange: { min: '', max: '' },
      sort: DEFAULT_SORT,
      search: '',
      pageSize: DEFAULT_PAGE_SIZE,
      notesOpenId: null,
      page: 0,
      selectedIds: new Set(),

      setActiveTriageTab: (activeTriageTab) => set({ activeTriageTab }),
      setActiveCancelTab: (activeCancelTab) => set({ activeCancelTab }),
      setBankFilters: (bankFilters) => set({ bankFilters }),
      setCategoryFilters: (categoryFilters) => set({ categoryFilters }),
      setOwnerFilters: (ownerFilters) => set({ ownerFilters }),
      setAmountRange: (amountRange) => set({ amountRange }),
      setSort: (sort) => set({ sort }),
      setSearch: (search) => set({ search }),
      setPageSize: (pageSize) => set({ pageSize }),
      setNotesOpenId: (notesOpenId) => set({ notesOpenId }),
      setPage: (page) => set({ page }),
      setSelectedIds: (selectedIds) => set({ selectedIds }),
      resetFilters: () =>
        set({
          bankFilters: [],
          categoryFilters: [],
          ownerFilters: [],
          amountRange: { min: '', max: '' },
          sort: DEFAULT_SORT,
          search: '',
          page: 0,
          pageSize: DEFAULT_PAGE_SIZE,
        }),
    }),
    {
      name: 'finances:triage',
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        activeTriageTab,
        activeCancelTab,
        bankFilters,
        categoryFilters,
        ownerFilters,
        amountRange,
        sort,
        search,
        pageSize,
      }) => ({
        activeTriageTab,
        activeCancelTab,
        bankFilters,
        categoryFilters,
        ownerFilters,
        amountRange,
        sort,
        search,
        pageSize,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<TriageStore>),
      }),
    },
  ),
);
