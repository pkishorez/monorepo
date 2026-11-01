import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
} from 'lucide-react';
import {
  DEMO,
  PARTS,
  SECTIONS,
  router,
  sectionOf,
} from '../../shared/index.ts';
import type { Route, Section, Slug } from '../../shared/index.ts';

/*
 * kabuki's docs, section by section, as its table of contents says. First
 * a way out of kabuki, back to the stack's home. Then how to start, then
 * the four Parts, named in lowercase as their packages are and numbered
 * at the right in the order they are read, then the demos; the
 * full-screen one ends them, in a new tab.
 *
 * Only the section being read is open: the others fold to their title, so
 * the reader holds one section at a time.
 * Any can be opened or folded by its title; moving to a page in a folded
 * section opens it.
 *
 * An open section hangs its pages off one line, dropped from its title's
 * chevron, its groups' small titles
 * sitting on the line between them. The page shown is marked by a bar on
 * that line, placed by its distance from the top of its own list, so
 * neither the page nor the list scrolling under it can make it jump: it
 * slides from page to page inside a section, and appears in place in a
 * new one.
 */

const currentSlug = (route: Route): Slug | undefined =>
  route._tag === 'Kabuki' && route.page?._tag === 'Doc'
    ? route.page.slug
    : undefined;

const focus =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

const row = `flex min-h-8 items-center rounded-r-md py-1 pr-2 pl-4 text-[13.5px] text-muted-foreground transition-colors duration-150 pointer-coarse:min-h-11 hover:bg-muted/60 hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground ${focus}`;

/** `back`: the way out to the stack's home, left off where that is the page. */
export function Sidebar({ back = true }: { readonly back?: boolean } = {}) {
  const { route } = useRouter<Route>();
  const current = currentSlug(route);
  const home = current ? sectionOf(current).title : SECTIONS[0]!.title;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([home]));
  // Moving to a page in a folded section opens it; the rest stay as left.
  const [seen, setSeen] = useState(home);
  if (seen !== home) {
    setSeen(home);
    if (!open.has(home)) setOpen(new Set([...open, home]));
  }
  const toggle = (title: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (!next.delete(title)) next.add(title);
      return next;
    });

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
    <nav ref={nav} aria-label="kabuki docs" className="space-y-5">
      {back && (
        <Router.Link
          to={router.Home()}
          className={`group ml-2 flex w-fit items-center gap-1.5 rounded-md text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground ${focus}`}
        >
          <ArrowLeftIcon className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
          ke stack
        </Router.Link>
      )}
      <div className="space-y-1">
        {SECTIONS.map((section) => (
          <SectionList
            key={section.title}
            section={section}
            current={current}
            open={open.has(section.title)}
            onToggle={() => toggle(section.title)}
          />
        ))}
      </div>
    </nav>
  );
}

function SectionList({
  section,
  current,
  open,
  onToggle,
}: {
  readonly section: Section;
  readonly current: Slug | undefined;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const id = useId();
  const part = PARTS.indexOf(section);
  const reading = section.groups.some((group) =>
    group.docs.some((doc) => doc.slug === current),
  );
  return (
    <section>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className={`group flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold transition-colors duration-150 pointer-coarse:min-h-11 hover:bg-muted/60 ${reading || open ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'} ${focus}`}
        >
          <ChevronRightIcon
            aria-hidden
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0 flex-1 truncate">{section.title}</span>
          {part >= 0 && (
            <span
              aria-label={`part ${part + 1} of ${PARTS.length}`}
              className="w-5 text-right font-mono text-[11px] font-normal text-muted-foreground tabular-nums"
            >
              {`${part + 1}`.padStart(2, '0')}
            </span>
          )}
        </button>
      </h2>
      {/* Folds by its rows' height, 0fr to 1fr, so nothing is measured. */}
      <div
        id={id}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <Rail section={section} current={current} />
        </div>
      </div>
    </section>
  );
}

/** A section's pages on one line, the page shown marked by a bar on it. */
function Rail({
  section,
  current,
}: {
  readonly section: Section;
  readonly current: Slug | undefined;
}) {
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
    <ul
      ref={list}
      className="relative mt-0.5 mb-3 ml-[15px] border-l border-border"
    >
      <span
        ref={bar}
        aria-hidden
        className="pointer-events-none absolute top-0 -left-px w-0.5 rounded-full bg-foreground opacity-0 motion-reduce:transition-none!"
      />
      {section.groups.map((group, index) => (
        <li key={group.title ?? index}>
          {group.title && (
            <p
              className={`pr-2 pb-1 pl-4 text-[11px] font-medium text-muted-foreground ${index === 0 ? 'pt-1' : 'pt-3'}`}
            >
              {group.title}
            </p>
          )}
          <ul>
            {group.docs.map((doc) => (
              <li key={doc.slug}>
                <Router.Link
                  to={router.Kabuki.Doc({ slug: doc.slug })}
                  aria-current={current === doc.slug ? 'page' : undefined}
                  className={row}
                >
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                </Router.Link>
              </li>
            ))}
            {group.docs.some((doc) => doc.slug === 'opening-an-app') && (
              <li>
                <a
                  href={DEMO.href}
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
