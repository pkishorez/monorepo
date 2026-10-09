import { Link } from '../../location/index.js';
import { paths } from '../route/index.js';
import { TREE, entryAt, sizeOf } from './tree.js';
import type { Entry } from './tree.js';

/*
 * The Files pages, drawn from the root's FilesIndex and Files States: every
 * path under /files is one route holding the rest of the path, so a
 * directory, a file and nothing at all are three drawings of the same State.
 */

type Navigate = (path: string) => void;

const LINK = 'text-primary hover:underline';

const EntryList = ({
  parent,
  entries,
  onNavigate,
}: {
  readonly parent: ReadonlyArray<string>;
  readonly entries: ReadonlyArray<Entry>;
  readonly onNavigate: Navigate;
}) => (
  <ul className="divide-y rounded-lg border">
    {entries.map((entry) => (
      <li
        key={entry.name}
        className="flex items-center justify-between px-4 py-3"
      >
        <Link
          to={paths.files([...parent, entry.name])}
          onNavigate={onNavigate}
          className={LINK}
        >
          {entry.name}
        </Link>
        <span className="text-sm text-muted-foreground">
          {entry._tag === 'File'
            ? sizeOf(entry.bytes)
            : `${entry.entries.length} ${entry.entries.length === 1 ? 'item' : 'items'}`}
        </span>
      </li>
    ))}
  </ul>
);

const Breadcrumbs = ({
  path,
  onNavigate,
}: {
  readonly path: ReadonlyArray<string>;
  readonly onNavigate: Navigate;
}) => (
  <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm">
    <Link to={paths.files()} onNavigate={onNavigate} className={LINK}>
      Files
    </Link>
    {path.map((segment, index) => (
      <span key={path.slice(0, index + 1).join('/')} className="flex gap-2">
        <span className="text-muted-foreground">/</span>
        {index === path.length - 1 ? (
          <span className="font-medium">{segment}</span>
        ) : (
          <Link
            to={paths.files(path.slice(0, index + 1))}
            onNavigate={onNavigate}
            className={LINK}
          >
            {segment}
          </Link>
        )}
      </span>
    ))}
  </nav>
);

export const FilesIndexPage = ({
  onNavigate,
}: {
  readonly onNavigate: Navigate;
}) => (
  <section className="flex flex-col gap-6">
    <h1 className="text-3xl font-semibold">Files</h1>
    <p className="text-muted-foreground">
      Every path under /files is one route holding the rest of the path.
    </p>
    <EntryList parent={[]} entries={TREE} onNavigate={onNavigate} />
  </section>
);

export const FilesPage = ({
  path,
  onNavigate,
}: {
  readonly path: ReadonlyArray<string>;
  readonly onNavigate: Navigate;
}) => {
  const entry = entryAt(path);
  return (
    <section className="flex flex-col gap-6">
      <Breadcrumbs path={path} onNavigate={onNavigate} />
      {!entry ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold text-destructive">
            Nothing Here
          </h1>
          <p className="text-muted-foreground">
            No file or directory at “{path.join('/')}”.
          </p>
        </div>
      ) : entry._tag === 'Directory' ? (
        <EntryList
          parent={path}
          entries={entry.entries}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="rounded-lg border p-6">
          <h2 className="text-2xl font-semibold">{entry.name}</h2>
          <p className="text-muted-foreground">{sizeOf(entry.bytes)}</p>
        </div>
      )}
    </section>
  );
};
