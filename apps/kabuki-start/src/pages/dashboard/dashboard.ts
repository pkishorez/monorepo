import { Clock, Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Routes } from '../../routes.ts';
import { Report } from './report.tsx';

/*
 * The dashboard: a client place, loaded and drawn in the browser alone. Its
 * clock ticks from a Worker, which runs only once the Runtime has started;
 * its View, with the chart, is in a chunk of its own.
 */

export const reports = Routes.Dashboard.outlet({
  Overview: () => null,
  Report,
});

export const DashboardActor = Actor.make('Dashboard', {
  input: Routes.Dashboard.input,
  props: Routes.Dashboard.props,
  model: Schema.Struct({
    stats: Routes.Dashboard.input,
    now: Schema.Number,
  }),
  message: Schema.TaggedUnion({ Ticked: { now: Schema.Number } }),
}).build({
  init: (stats) => ({ model: { stats, now: stats.loadedAt } }),
  children: reports.children,
  invoke: reports.invoke,
  workers: {
    clock: {
      run: (self) =>
        Effect.forever(
          Effect.sleep('1 second').pipe(
            Effect.andThen(Clock.currentTimeMillis),
            Effect.flatMap((now) => self.send({ _tag: 'Ticked', now })),
          ),
        ),
    },
  },
  on: {
    Ticked: ({ now }, { model }) => ({ model: { ...model, now } }),
  },
});

export const Dashboard = {
  actor: DashboardActor,
  view: View.lazy(() => import('./dashboard.view.tsx')),
};
