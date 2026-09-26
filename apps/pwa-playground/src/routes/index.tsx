import { createFileRoute, Link } from '@tanstack/react-router';
import { ScenarioPage } from '../components/index.ts';
import { scenarios } from '../lib/scenarios.ts';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <ScenarioPage
      id="home"
      title="PWA Playground"
      explanation={
        <p>
          Each page below exercises one part of pwa-toolkit and shows its live
          state. Open DevTools, Application, to watch the service worker and
          Cache Storage alongside.
        </p>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {scenarios.map((scenario) => (
          <li key={scenario.path}>
            <Link
              to={scenario.path}
              data-testid={`link-${scenario.path.slice(1)}`}
              className="flex h-full flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 hover:bg-muted"
            >
              <span className="font-medium">{scenario.title}</span>
              <span className="text-sm text-muted-foreground">
                {scenario.summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ScenarioPage>
  );
}
