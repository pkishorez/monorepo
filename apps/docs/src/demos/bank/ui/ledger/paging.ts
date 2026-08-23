import { useState } from 'react';
import { LEDGER_PAGE_SIZE } from '../../contract/tuning/index.ts';

export interface Paging {
  /** 0-based page; clamped so it never points past the last page. */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  /** 1-based row numbers of the current page, for "21–40 of 100,000". */
  readonly first: number;
  readonly last: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}

/** Pages through `total` rows, LEDGER_PAGE_SIZE at a time. */
export const usePaging = (total: number) => {
  const [wanted, setWanted] = useState(0);
  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const page = Math.min(wanted, pageCount - 1);
  const offset = page * LEDGER_PAGE_SIZE;
  return {
    offset,
    limit: LEDGER_PAGE_SIZE,
    page,
    pageCount,
    total,
    first: total === 0 ? 0 : offset + 1,
    last: Math.min(total, offset + LEDGER_PAGE_SIZE),
    onPrev: () => setWanted(Math.max(0, page - 1)),
    onNext: () => setWanted(Math.min(pageCount - 1, page + 1)),
  };
};
