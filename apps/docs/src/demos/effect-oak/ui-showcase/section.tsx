import type { ReactNode } from 'react';

/** One demo on a page: a heading, a line on what to try, and the component. */
export const Section = ({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
    <div className="flex flex-wrap items-start gap-4">{children}</div>
  </section>
);

/** The latest report from each of a page's components, as the parent keeps it. */
export const Heard = ({
  sources,
  heard,
}: {
  readonly sources: ReadonlyArray<string>;
  readonly heard: { readonly [source: string]: string };
}) =>
  sources.length === 0 ? null : (
    <aside className="rounded-lg border border-dashed p-4">
      <h3 className="mb-2 text-sm font-medium">What the parent heard</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
        {sources.map((source) => (
          <div key={source} className="contents">
            <dt className="text-muted-foreground">{source}</dt>
            <dd>{heard[source] ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
