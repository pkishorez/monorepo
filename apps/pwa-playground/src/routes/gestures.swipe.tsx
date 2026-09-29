import { createFileRoute } from '@tanstack/react-router';
import { BackToGestures, ThemeToggle } from '../components/index.ts';
import { type CaseId, GestureLab, parseCase } from './-gestures/index.ts';
import { SWIPE_CASES, SwipeLegend } from './-swipe/index.ts';

type SwipeSearch = { readonly case: CaseId };

export const Route = createFileRoute('/gestures/swipe')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): SwipeSearch => ({
    case: parseCase(SWIPE_CASES, search.case),
  }),
  component: Swipe,
});

function Swipe() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GestureLab
      cases={SWIPE_CASES}
      id={search.case}
      onCase={(next) =>
        void navigate({ search: { case: next }, replace: true })
      }
      legend={<SwipeLegend />}
      walk={false}
      start={<BackToGestures />}
      end={<ThemeToggle />}
    />
  );
}
