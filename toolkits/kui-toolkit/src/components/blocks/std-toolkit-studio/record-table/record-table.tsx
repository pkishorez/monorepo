import { Braces, ChevronLeft, ChevronRight } from 'lucide-react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import type { StudioRecord } from '../query-model';

const preview = (value: unknown): React.ReactNode => {
  if (value === null)
    return <span className="text-muted-foreground">null</span>;
  if (value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean') {
    return <Badge variant="outline">{String(value)}</Badge>;
  }
  if (typeof value === 'object') {
    return (
      <span className="block max-w-64 truncate font-mono text-xs text-muted-foreground">
        {JSON.stringify(value)}
      </span>
    );
  }
  return String(value);
};

export function RecordTable({
  records,
  columns,
  page,
  hasPrevious,
  hasNext,
  pageSize,
  paginated = true,
  onPrevious,
  onNext,
  onPageSizeChange,
  onRecordOpen,
}: {
  readonly records: readonly StudioRecord[];
  readonly columns: readonly string[];
  readonly page: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly pageSize: number;
  readonly paginated?: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onPageSizeChange: (size: number) => void;
  readonly onRecordOpen: (record: StudioRecord) => void;
}) {
  if (records.length === 0) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Braces />
          </EmptyMedia>
          <EmptyTitle>No records found</EmptyTitle>
          <EmptyDescription>
            The query completed, but this item collection is empty.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <Table>
        <TableHeader className="bg-muted/35">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className="font-mono text-xs">
                {column}
              </TableHead>
            ))}
            <TableHead className="font-mono text-xs">Meta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => (
            <TableRow
              key={`${record.meta._u}:${index}`}
              className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none"
              tabIndex={0}
              aria-label={`Open record ${index + 1}`}
              onClick={() => onRecordOpen(record)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRecordOpen(record);
                }
              }}
            >
              {columns.map((column) => (
                <TableCell key={column}>
                  {preview(record.value[column])}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <Badge variant="outline">_v {record.value._v}</Badge>
                  {'_d' in record.meta && (
                    <Badge
                      variant={record.meta._d ? 'destructive' : 'secondary'}
                    >
                      _d {String(record.meta._d)}
                    </Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {paginated && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value ?? 10))}
            >
              <SelectTrigger
                size="sm"
                className="w-20"
                aria-label="Rows per page"
              >
                <SelectValue>{pageSize}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrevious}
              disabled={!hasPrevious}
            >
              <ChevronLeft />
              Previous
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground">
              Page {page}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={!hasNext}
            >
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
