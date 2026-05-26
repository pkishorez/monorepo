import { createContext, useContext, useMemo, useState } from 'react';
import type { DateRange } from '@monorepo/frontend/components/ui/calendar';

interface DateRangeContextValue {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
}

const DateRangeContext = createContext<DateRangeContextValue>({
  dateRange: undefined,
  setDateRange: () => {},
});

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const value = useMemo(() => ({ dateRange, setDateRange }), [dateRange]);
  return (
    <DateRangeContext.Provider value={value}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  return useContext(DateRangeContext);
}
