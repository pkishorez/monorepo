import { ChevronRightIcon } from '@kstackz/ui-toolkit/lucide';
import type { Section } from '../lib/sections.ts';

/** A Section's page: its title, then its rows. The App Shell scrolls it. */
export function SectionPage(props: { readonly section: Section }) {
  const { section } = props;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{section.title}</h1>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-edge">
        {section.rows.map((row) => (
          <li
            key={row.title}
            className="flex min-h-14 items-center gap-3 px-4 py-3"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{row.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {row.meta}
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
