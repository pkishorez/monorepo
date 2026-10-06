import { createFileRoute } from '@tanstack/react-router';

// Entries shows the open Entry itself, beside or instead of the list.
export const Route = createFileRoute('/_ledger/entries/$entryId')({
  component: () => null,
});
