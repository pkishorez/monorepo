import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { ArrowUpRightIcon } from 'lucide-react';
import { packageOf } from '../../shared/index.ts';
import type { Package, Route, Section } from '../../shared/index.ts';
import { docRoute, slugAt } from './package-link.tsx';
import { PackageSwitcher } from './package-switcher.tsx';

/*
 * A package's docs, section by section, as its table of contents says.
 * First, held at the top as the list scrolls, which package this is and
 * the way to any other, or back to the stack's home. Then every section,
 * open: a heading in full-strength text, a Part's import path under it in
 * mono, and its pages hanging off one line below, in groups whose titles
 * are in the site's accent. A heading is a heading, not a
 * button: the whole map of the docs is in view at once, and the reader
 * finds their place by it.
 *
 * The page shown is marked by a bar on its section's line, placed by its
 * distance from the top of its own list, so neither the page nor the list
 * scrolling under it can make it jump: it slides from page to page inside
 * a section, and appears in place in a new one.
 */

const focus =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

const row = `flex min-h-8 items-center rounded-r-md py-1 pr-2 pl-4 text-[13.5px] text-muted-foreground transition-colors duration-150 pointer-coarse:min-h-11 hover:bg-muted/60 hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground ${focus}`;

export function Sidebar({ id }: { readonly id: Package['id'] }) {
  const { route } = useRouter<Route>();
  const current = slugAt(route);
  const pkg = packageOf(id);

  const nav = useRef<HTMLElement>(null);
  // Scrolls the list, not the page, so the page shown is in view.
  useEffect(() => {
    const list = nav.current?.closest<HTMLElement>('[data-sidebar-scroll]');
    const shown = nav.current?.querySelector<HTMLElement>(
      '[aria-current=page]',
    );
    if (!list || !shown) return;
    const top =
      shown.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 48)
      list.scrollTop = top - list.clientHeight / 3;
  }, [current]);

  return (
    <nav ref={nav} aria-label={`${pkg.name} docs`} className="space-y-7">
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pt-1 pb-1 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-5 after:bg-linear-to-b after:from-background after:to-transparent">
        <PackageSwitcher id={id} />
      </div>
      {pkg.contents.sections.map((section) => (
        <SectionList
          key={section.title}
          id={id}
          section={section}
          current={current}
        />
      ))}
    </nav>
  );
}

function SectionList({
  id,
  section,
  current,
}: {
  readonly id: Package['id'];
  readonly section: Section;
  readonly current: string | undefined;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="px-2">
        <span className="block text-[14px] leading-5 font-semibold tracking-tight text-foreground">
          {section.title}
        </span>
        {section.path && (
          <code className="mt-0.5 block truncate font-mono text-[11px] leading-4 text-muted-foreground">
            {section.path}
          </code>
        )}
      </h2>
      <Rail id={id} section={section} current={current} />
    </section>
  );
}

/** A section's pages on one line, the page shown marked by a bar on it. */
function Rail({
  id,
  section,
  current,
}: {
  readonly id: Package['id'];
  readonly section: Section;
  readonly current: string | undefined;
}) {
  const fullScreen = packageOf(id).contents.fullScreen;
  const list = useRef<HTMLUListElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  // Places the bar beside the page shown, by its distance from the top of
  // this list: it slides once it has been placed, and appears in place
  // the first time, or after it was gone.
  useLayoutEffect(() => {
    const mark = bar.current;
    const shown = list.current?.querySelector<HTMLElement>(
      '[aria-current=page]',
    );
    if (!mark) return;
    if (!shown) {
      mark.style.opacity = '0';
      placed.current = false;
      return;
    }
    mark.style.transition = placed.current
      ? 'transform 250ms cubic-bezier(0.23, 1, 0.32, 1), height 250ms cubic-bezier(0.23, 1, 0.32, 1)'
      : 'none';
    mark.style.transform = `translateY(${shown.offsetTop + 6}px)`;
    mark.style.height = `${shown.offsetHeight - 12}px`;
    mark.style.opacity = '1';
    placed.current = true;
  }, [current]);
  return (
    <ul ref={list} className="relative mt-2.5 ml-2 border-l border-border">
      <span
        ref={bar}
        aria-hidden
        className="pointer-events-none absolute top-0 -left-px w-0.5 rounded-full bg-foreground opacity-0 motion-reduce:transition-none!"
      />
      {section.groups.map((group, index) => (
        <li key={group.title ?? index}>
          {group.title && (
            <p
              className={`pr-2 pb-1 pl-4 text-[12px] leading-5 font-semibold text-(--field-accent) ${index === 0 ? 'pt-1.5' : 'pt-4'}`}
            >
              {group.title}
            </p>
          )}
          <ul>
            {group.docs.map((doc) => (
              <li key={doc.slug}>
                <Router.Link
                  to={docRoute(id, doc.slug)}
                  aria-current={current === doc.slug ? 'page' : undefined}
                  className={row}
                >
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                </Router.Link>
              </li>
            ))}
            {fullScreen &&
              group.docs.some((doc) => doc.slug === fullScreen.after) && (
                <li>
                  <a
                    href={fullScreen.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`group gap-2 ${row}`}
                  >
                    <span className="min-w-0 flex-1 truncate">Full screen</span>
                    <ArrowUpRightIcon className="size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                </li>
              )}
          </ul>
        </li>
      ))}
    </ul>
  );
}
