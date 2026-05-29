import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DateRange } from '@monorepo/frontend/components/ui/calendar';

interface DateRangeStore {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
}

export const useDateRangeStore = create<DateRangeStore>()(
  persist(
    (set) => ({
      dateRange: undefined,
      setDateRange: (range) => set({ dateRange: range }),
    }),
    {
      name: 'finances:date-range',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ dateRange: state.dateRange }),
      merge: (persisted, current) => {
        const p = persisted as Partial<{ dateRange: unknown }>;
        if (
          p?.dateRange &&
          typeof p.dateRange === 'object' &&
          p.dateRange !== null
        ) {
          const raw = p.dateRange as Record<string, unknown>;
          if (typeof raw.from === 'string') raw.from = new Date(raw.from);
          if (typeof raw.to === 'string') raw.to = new Date(raw.to);
        }
        return { ...current, ...(p as Partial<DateRangeStore>) };
      },
    },
  ),
);

export function useDateRange() {
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const setDateRange = useDateRangeStore((s) => s.setDateRange);
  return { dateRange, setDateRange };
}
