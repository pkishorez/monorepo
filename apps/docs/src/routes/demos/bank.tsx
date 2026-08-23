import {
  createFileRoute,
  type SearchSchemaInput,
} from '@tanstack/react-router';
import {
  BankPage,
  isStoreKey,
  type BankStoreKey,
} from '@/demos/bank/app/bank-page';

export const Route = createFileRoute('/demos/bank')({
  component: BankRoute,
  ssr: false,
  validateSearch: (
    search: {
      store?: BankStoreKey;
      debug?: boolean;
      admin?: string;
    } & SearchSchemaInput,
  ): { store: BankStoreKey; debug?: boolean; admin?: string } => ({
    store: isStoreKey(search.store) ? search.store : 'idb',
    ...(search.debug === true ? { debug: true } : {}),
    ...(typeof search.admin === 'string' ? { admin: search.admin } : {}),
  }),
  head: () => ({
    meta: [
      { title: 'Bank — a live demo of std-toolkit' },
      {
        name: 'description',
        content:
          'Move money between accounts and watch both balances settle — one atomic commit per transfer, optimistically on screen, over three stores of growing sync radius.',
      },
    ],
    styles: [{ children: 'body { overflow: hidden; }' }],
  }),
});

function BankRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BankPage
      store={search.store}
      debug={search.debug === true}
      onStore={(store) =>
        void navigate({ search: { ...search, store }, replace: true })
      }
      onDebug={(open) =>
        void navigate({
          search: { store: search.store, ...(open ? { debug: true } : {}) },
          replace: true,
        })
      }
    />
  );
}
