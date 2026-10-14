import type { Routes } from '../../../../shared/index.ts';
import { Card, CardContent } from '@kestack/web-platform/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@kestack/web-platform/components/table';
import { PageFrame } from '../../../components/index.ts';

type ReportInput = typeof Routes.Dashboard.Report.input.Type;

/** One report: a client place with params, under the dashboard. */
export const Report = (_props: unknown, report: ReportInput) => {
  const top = Math.max(...report.rows.map((row) => row.value));
  return (
    <PageFrame
      place="Dashboard.Report"
      loadedAt={report.loadedAt}
      title={report.title}
    >
      <Card size="sm" className="max-w-2xl">
        <CardContent>
          <Table>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.label} className="hover:bg-transparent">
                  <TableHead
                    scope="row"
                    className="pl-0 font-normal text-foreground"
                  >
                    {row.label}
                  </TableHead>
                  <TableCell className="w-full">
                    <div
                      className="h-2 rounded-full bg-primary/70"
                      style={{ width: `${(row.value / top) * 100}%` }}
                    />
                  </TableCell>
                  <TableCell className="pr-0 text-right tabular-nums text-muted-foreground">
                    {row.value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageFrame>
  );
};
