import { createFileRoute, notFound } from '@tanstack/react-router';
import { hasScenario, ScenarioScreen } from '../showcases/gestures/index.ts';

// Not under /gestures' layout: a full-screen Scenario owns the whole screen.
export const Route = createFileRoute('/gestures_/$topic/$scenario')({
  beforeLoad: ({ params }) => {
    if (!hasScenario(params.topic, params.scenario)) throw notFound();
  },
  component: function Scenario() {
    const { topic, scenario } = Route.useParams();
    return <ScenarioScreen topic={topic} scenario={scenario} />;
  },
});
