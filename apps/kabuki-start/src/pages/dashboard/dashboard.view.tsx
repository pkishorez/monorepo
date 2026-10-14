import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Badge } from '@kestack/web-platform/components/badge';
import { buttonVariants } from '@kestack/web-platform/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { Page, clock } from '../../parts/index.ts';
import { Routes } from '../../routes.ts';
import { DashboardActor, reports } from './dashboard.ts';

/*
 * The dashboard's View, in a chunk of its own: the chart is drawn here, so
 * a page that never shows it never loads it.
 */

const WIDTH = 560;
const HEIGHT = 160;

/** Visits per day as a line, scaled to fit. */
const path = (values: ReadonlyArray<number>) => {
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const step = WIDTH / (values.length - 1);
  return values
    .map((value, at) => {
      const y =
        HEIGHT - ((value - bottom) / (top - bottom || 1)) * (HEIGHT - 16) - 8;
      return `${at === 0 ? 'M' : 'L'}${(at * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

export default View.make(DashboardActor, (self) => {
  const { stats, now } = self.model;
  const total = stats.visits.reduce((sum, each) => sum + each, 0);
  return (
    <div {...self.root} className="space-y-10">
      <Page
        place="Dashboard"
        loadedAt={stats.loadedAt}
        title="Dashboard"
        intro="A client place: the server sent the page around it empty, and the browser loaded its stats, then this View."
      >
        <Badge variant="outline" className="h-6 gap-1.5 px-2.5 font-mono">
          <span aria-hidden className="size-1.5 rounded-full bg-sky-500" />
          Live: <span data-testid="clock">{clock(now)}</span>
        </Badge>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Visits, 14 days', total],
            ['Sign-ups', stats.signups],
            ['Orders', stats.orders],
          ].map(([label, value]) => (
            <Card key={label} size="sm">
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {value}
                </p>
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Visits per day</CardTitle>
            <CardDescription>The last two weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              className="h-44 w-full text-primary"
              role="img"
              aria-label="Visits per day over the last two weeks"
            >
              <path
                d={path(stats.visits)}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </CardContent>
        </Card>
        <ul className="flex flex-wrap gap-2">
          {stats.reports.map((report) => (
            <li key={report.id}>
              <Router.Link
                to={Routes.Dashboard.Report({ id: report.id })}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                {report.title}
              </Router.Link>
            </li>
          ))}
        </ul>
      </Page>
      <reports.View of={self} />
    </div>
  );
});
