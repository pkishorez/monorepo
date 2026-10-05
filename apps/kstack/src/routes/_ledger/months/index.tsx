import { createFileRoute } from '@tanstack/react-router';
import { Months } from '../../../app/months/index.ts';

export const Route = createFileRoute('/_ledger/months/')({
  validateSearch: (search): { at?: string } =>
    typeof search['at'] === 'string' ? { at: search['at'] } : {},
  component: MonthsRoute,
});

function MonthsRoute() {
  return <Months at={Route.useSearch().at} />;
}
