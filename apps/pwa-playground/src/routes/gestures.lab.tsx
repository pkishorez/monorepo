import { createFileRoute } from '@tanstack/react-router';
import { BackToGestures, ThemeToggle } from '../components/index.ts';
import {
  CASES,
  type CaseId,
  GestureLab,
  parseCase,
} from './-gestures/index.ts';

type GestureSearch = { readonly case: CaseId };

export const Route = createFileRoute('/gestures/lab')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): GestureSearch => ({
    case: parseCase(CASES, search.case),
  }),
  component: Lab,
});

function Lab() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GestureLab
      cases={CASES}
      id={search.case}
      onCase={(next) =>
        void navigate({ search: { case: next }, replace: true })
      }
      start={<BackToGestures />}
      end={<ThemeToggle />}
    />
  );
}
