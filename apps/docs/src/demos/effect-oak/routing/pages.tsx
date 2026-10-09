import type { ReactNode } from 'react';
import { Link } from '../location/index.js';
import { paths } from './route/index.js';

/*
 * What every route draws around its page: the nav, and an address bar
 * showing the path the shown State came from. During Time Travel it shows
 * the replayed path, while the browser's address bar stays on the live one.
 */

type Navigate = (path: string) => void;

const SECTIONS = [
  { label: 'Home', to: paths.home, tags: ['Home'] },
  { label: 'People', to: paths.people(), tags: ['People', 'Person'] },
  { label: 'Files', to: paths.files(), tags: ['FilesIndex', 'Files'] },
  { label: 'Nested', to: paths.nested, tags: ['Nested'] },
] as const;

export const Frame = ({
  route,
  path,
  onNavigate,
  children,
}: {
  readonly route: string;
  readonly path: string;
  readonly onNavigate: Navigate;
  readonly children: ReactNode;
}) => (
  <div className="flex size-full flex-col overflow-hidden sm:rounded-lg sm:border">
    <nav className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
      {SECTIONS.map((section) => {
        const current = (section.tags as ReadonlyArray<string>).includes(route);
        return (
          <Link
            key={section.label}
            to={section.to}
            onNavigate={onNavigate}
            current={current}
            className={`rounded-md px-3 py-1 text-sm font-medium hover:bg-muted ${current ? 'bg-muted' : 'text-muted-foreground'}`}
          >
            {section.label}
          </Link>
        );
      })}
      <code className="ml-auto truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
        #{path}
      </code>
    </nav>
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">{children}</div>
    </main>
  </div>
);

export const HomePage = ({ onNavigate }: { readonly onNavigate: Navigate }) => (
  <section className="flex flex-col gap-4">
    <h1 className="text-3xl font-semibold">Welcome Home</h1>
    <p className="text-muted-foreground">
      Each page is a State of the root Node, and the path lives after the{' '}
      <code>#</code> in the address bar. Use the links, the browser’s back and
      forward buttons, or edit the address by hand.
    </p>
    <p className="text-muted-foreground">
      Try{' '}
      <Link
        to={paths.people('dev')}
        onNavigate={onNavigate}
        className="text-primary hover:underline"
      >
        a search kept in the URL
      </Link>
      ,{' '}
      <Link
        to={paths.files(['photos', 'vacation'])}
        onNavigate={onNavigate}
        className="text-primary hover:underline"
      >
        a deep file path
      </Link>{' '}
      or{' '}
      <Link
        to="/nowhere"
        onNavigate={onNavigate}
        className="text-primary hover:underline"
      >
        a path no route matches
      </Link>
      .
    </p>
  </section>
);

export const NestedPage = () => (
  <section className="flex flex-col gap-4">
    <h1 className="text-3xl font-semibold">Very Nested Route!</h1>
    <p className="text-muted-foreground">
      You found the deeply nested route at {paths.nested}.
    </p>
  </section>
);

export const NotFoundPage = ({
  path,
  onNavigate,
}: {
  readonly path: string;
  readonly onNavigate: Navigate;
}) => (
  <section className="flex flex-col gap-4">
    <h1 className="text-3xl font-semibold text-destructive">
      404 - Page Not Found
    </h1>
    <p className="text-muted-foreground">The path “{path}” was not found.</p>
    <Link
      to={paths.home}
      onNavigate={onNavigate}
      className="text-primary hover:underline"
    >
      ← Go Home
    </Link>
  </section>
);
