import { createFileRoute } from '@tanstack/react-router';
import { BackLink, ThemeToggle } from '../components/index.ts';
import { type CaseId, GestureLab, parseCase } from './-gestures/index.ts';
import { SWIPE_CASES, SwipeLegend } from './-swipe/index.ts';

// Optional, so a plain link opens the first case.
type SwipeSearch = { readonly case?: CaseId };

export const Route = createFileRoute('/gestures/swipe-lab')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): SwipeSearch =>
    search.case === undefined
      ? {}
      : { case: parseCase(SWIPE_CASES, search.case) },
  component: SwipeLab,
});

function SwipeLab() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GestureLab
      cases={SWIPE_CASES}
      id={parseCase(SWIPE_CASES, search.case)}
      onCase={(next) =>
        void navigate({ search: { case: next }, replace: true })
      }
      legend={<SwipeLegend />}
      walk={false}
      start={<BackLink to="/gestures/swipe" label="Swipe" />}
      end={<ThemeToggle />}
    />
  );
}
