import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  JobApplication,
  JobApplicationLive,
  JobApplicationView,
} from '@/demos/effect-oak/job-application';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer holds only Reveals, how Submit reaches every step. */
const App = toReact(JobApplication, JobApplicationView, JobApplicationLive);

export const Route = createFileRoute('/demos/effect-oak/job-application')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
