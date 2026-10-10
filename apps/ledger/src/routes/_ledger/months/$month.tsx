import { createFileRoute, notFound } from '@tanstack/react-router';
import { Month } from '../../../screens/places/months/index.ts';
import { isMonthKey } from '../../../model/index.ts';

export const Route = createFileRoute('/_ledger/months/$month')({
  beforeLoad: ({ params }) => {
    if (!isMonthKey(params.month)) throw notFound();
  },
  component: MonthRoute,
});

function MonthRoute() {
  const { month } = Route.useParams();
  return <Month key={month} month={month} />;
}
