import type { ReactNode } from 'react';

import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';
import { Skeleton } from '@monorepo/frontend/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monorepo/frontend/components/ui/table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  onCellClick?: (row: T, e: React.MouseEvent) => void;
}

interface Sort {
  key: string;
  direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sort: Sort | null;
  setSort: (sort: Sort | null) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  expandedId?: string | null;
  setExpandedId?: (id: string | null) => void;
  renderExpanded?: (row: T) => ReactNode;
  getRowId: (row: T) => string;
  getRowClassName?: (row: T, index: number) => string;
  loading?: boolean;
  emptyState?: ReactNode;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SKELETON_ROW_COUNT = 5;

function toggleSort(current: Sort | null, key: string): Sort | null {
  if (current?.key !== key) return { key, direction: 'desc' };
  if (current.direction === 'desc') return { key, direction: 'asc' };
  return null;
}

function SortIcon({
  sort,
  columnKey,
}: {
  sort: Sort | null;
  columnKey: string;
}) {
  if (sort?.key !== columnKey) return <ArrowUpDown className="size-4" />;
  if (sort.direction === 'asc') return <ArrowUp className="size-4" />;
  return <ArrowDown className="size-4" />;
}

export function DataTable<T>({
  data,
  columns,
  sort,
  setSort,
  page,
  setPage,
  pageSize,
  setPageSize,
  expandedId,
  setExpandedId,
  renderExpanded,
  getRowId,
  getRowClassName,
  loading = false,
  emptyState,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const start = page * pageSize;
  const visibleRows = data.slice(start, start + pageSize);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSort(toggleSort(sort, col.key))}
                    >
                      {col.header}
                      <SortIcon sort={sort} columnKey={col.key} />
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyState ?? 'No results.'}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, index) => {
                const id = getRowId(row);
                const rowClassName = getRowClassName?.(row, index) ?? '';

                if (!setExpandedId) {
                  return (
                    <TableRow key={id} className={`group/row ${rowClassName}`}>
                      {columns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={`py-3 ${col.className ?? ''} ${col.onCellClick ? 'cursor-pointer' : ''}`}
                          onClick={
                            col.onCellClick
                              ? (e) => col.onCellClick!(row, e)
                              : undefined
                          }
                        >
                          {col.render(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                }

                const isExpanded = expandedId === id;
                return (
                  <ExpandableRow
                    key={id}
                    row={row}
                    columns={columns}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : id)}
                    renderExpanded={renderExpanded}
                    rowClassName={rowClassName}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select
            value={pageSize}
            onValueChange={(val) => {
              setPageSize(val as number);
              setPage(0);
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExpandableRow<T>({
  row,
  columns,
  isExpanded,
  onToggle,
  renderExpanded,
  rowClassName,
}: {
  row: T;
  columns: ColumnDef<T>[];
  isExpanded: boolean;
  onToggle: () => void;
  renderExpanded?: (row: T) => ReactNode;
  rowClassName?: string;
}) {
  return (
    <>
      <TableRow
        className={`group/row cursor-pointer transition-colors hover:bg-muted/50 ${rowClassName ?? ''}`}
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        {columns.map((col) => (
          <TableCell
            key={col.key}
            className={`py-3 ${col.className ?? ''} ${col.onCellClick ? 'cursor-pointer' : ''}`}
            onClick={
              col.onCellClick
                ? (e) => {
                    e.stopPropagation();
                    col.onCellClick!(row, e);
                  }
                : undefined
            }
          >
            {col.render(row)}
          </TableCell>
        ))}
      </TableRow>
      {isExpanded && renderExpanded && (
        <TableRow>
          <TableCell colSpan={columns.length} className="bg-muted/20 px-6 py-5">
            {renderExpanded(row)}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
