import { Badge } from '@kstackz/web-platform/components/badge';
import { COLUMNS, rowsFor } from './rows.js';
import type { Browse, Column, Sorting } from './rows.js';

export { DIETS, PERIODS, nextSorting } from './rows.js';
export type { Browse, Sorting } from './rows.js';

/*
 * The dinosaur table: the rows the filters let through, and headers that sort.
 */

const RIGHT: ReadonlySet<Column> = new Set(['Length', 'Weight']);
const LABELS: Record<Column, string> = {
  Name: 'Name',
  Period: 'Period',
  Diet: 'Diet',
  Length: 'Length (m)',
  Weight: 'Weight (kg)',
};

const directionOf = (sorting: Sorting, column: Column) =>
  sorting?.column === column ? sorting.direction : null;

const Header = ({
  column,
  sorting,
  onSort,
}: {
  readonly column: Column;
  readonly sorting: Sorting;
  readonly onSort: (column: Column) => void;
}) => {
  const direction = directionOf(sorting, column);
  return (
    <th
      aria-sort={
        direction === null
          ? 'none'
          : direction === 'Ascending'
            ? 'ascending'
            : 'descending'
      }
    >
      <button
        type="button"
        className={`w-full px-4 py-3 text-sm font-semibold hover:bg-muted ${RIGHT.has(column) ? 'text-right' : 'text-left'}`}
        onClick={() => onSort(column)}
      >
        {LABELS[column]}{' '}
        <span className="inline-block w-4 text-center">
          {direction === 'Ascending'
            ? '↑'
            : direction === 'Descending'
              ? '↓'
              : ''}
        </span>
      </button>
    </th>
  );
};

export const Table = ({
  browse,
  onSort,
}: {
  readonly browse: Browse;
  readonly onSort: (column: Column) => void;
}) => {
  const rows = rowsFor(browse);
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            {COLUMNS.map((column) => (
              <Header
                key={column}
                column={column}
                sorting={browse.sorting}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.name} className="border-b last:border-0">
              <td className="px-4 py-2 text-sm font-medium">{d.name}</td>
              <td className="px-4 py-2 text-sm">
                <Badge variant="outline">{d.period}</Badge>
              </td>
              <td className="px-4 py-2 text-sm">
                <Badge variant="secondary">{d.diet}</Badge>
              </td>
              <td className="px-4 py-2 text-right text-sm tabular-nums">
                {d.lengthMeters}
              </td>
              <td className="px-4 py-2 text-right text-sm tabular-nums">
                {d.weightKg.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No dinosaurs match these filters.
        </p>
      )}
    </div>
  );
};
