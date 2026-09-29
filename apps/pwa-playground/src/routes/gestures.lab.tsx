import { createFileRoute } from '@tanstack/react-router';
import { BackLink, ThemeToggle } from '../components/index.ts';
import {
  CASES,
  type CaseId,
  GestureLab,
  parseCase,
} from './-gestures/index.ts';

// Optional, so a plain link opens the first case.
type GestureSearch = { readonly case?: CaseId };

export const Route = createFileRoute('/gestures/lab')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): GestureSearch =>
    search.case === undefined ? {} : { case: parseCase(CASES, search.case) },
  component: Lab,
});

function Lab() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GestureLab
      cases={CASES}
      id={parseCase(CASES, search.case)}
      onCase={(next) =>
        void navigate({ search: { case: next }, replace: true })
      }
      start={<BackLink to="/gestures/zones" label="Zones" />}
      end={<ThemeToggle />}
    />
  );
}
