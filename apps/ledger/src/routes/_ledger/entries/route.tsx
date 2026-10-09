import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { validateEntriesSearch } from '../../../places/index.ts';
import { Entries } from '../../../screens/places/entries/index.ts';

// The list and the open Entry stay one page, so the list keeps its place.
export const Route = createFileRoute('/_ledger/entries')({
  validateSearch: validateEntriesSearch,
  component: EntriesRoute,
});

function EntriesRoute() {
  const search = Route.useSearch();
  const { entryId } = useParams({ strict: false });
  return (
    <>
      <Entries search={search} open={entryId} />
      <Outlet />
    </>
  );
}
