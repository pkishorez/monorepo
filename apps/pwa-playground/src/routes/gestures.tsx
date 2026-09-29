import { Link, createFileRoute } from '@tanstack/react-router';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { HouseIcon } from '@kstackz/ui-toolkit/lucide';
import { ThemeToggle } from '../components/index.ts';
import { type CaseId, GestureLab, parseCase } from './-gestures/index.ts';

type GestureSearch = { readonly case: CaseId };

export const Route = createFileRoute('/gestures')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): GestureSearch => ({
    case: parseCase(search.case),
  }),
  component: Gestures,
});

function Gestures() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GestureLab
      id={search.case}
      onCase={(next) =>
        void navigate({ search: { case: next }, replace: true })
      }
      start={
        <Link
          to="/"
          aria-label="Home"
          className={buttonVariants({
            variant: 'ghost',
            size: 'icon',
            className: 'size-11 shrink-0',
          })}
        >
          <HouseIcon aria-hidden="true" />
        </Link>
      }
      end={<ThemeToggle />}
    />
  );
}
