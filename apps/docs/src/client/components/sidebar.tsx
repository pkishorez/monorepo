import { Router, useRouter } from '@kestack/kabuki/routing';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
} from '@kestack/web-platform/components/lucide';
import { DEMO, SECTIONS, numberOf, router } from '../../shared/index.ts';
import type { Route, Slug } from '../../shared/index.ts';

/*
 * kabuki's docs, section by section, as its table of contents says. First
 * a way out of kabuki, back to the stack's home. Each section hangs its
 * pages off a line, and the page shown marks its part of the line. The
 * primitives are numbered, to read in order. Last, the demos, from the
 * simplest up; the full-screen one ends them, in a new tab.
 */

const currentSlug = (route: Route): Slug | undefined =>
  route._tag === 'Kabuki' && route.page?._tag === 'Doc'
    ? route.page.slug
    : undefined;

const row =
  '-ml-px flex min-h-8 items-center gap-2.5 border-l-2 border-transparent py-1 pr-2 pl-3.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground';

export function Sidebar() {
  const { route } = useRouter<Route>();
  const current = currentSlug(route);
  return (
    <nav aria-label="kabuki docs" className="space-y-7">
      <Router.Link
        to={router.Home()}
        className="group flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        ke stack
      </Router.Link>
      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-[13px] font-semibold text-foreground">
            {section.title}
          </h2>
          <ul className="border-l border-border">
            {section.docs.map((doc) => (
              <li key={doc.slug}>
                <Router.Link
                  to={router.Kabuki.Doc({ slug: doc.slug })}
                  aria-current={current === doc.slug ? 'page' : undefined}
                  className={row}
                >
                  {'numbered' in section && (
                    <span className="w-3 shrink-0 font-mono text-[11px] tabular-nums opacity-70">
                      {numberOf(doc.slug)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                </Router.Link>
              </li>
            ))}
            {section.title === 'Demos' && (
              <li>
                <a
                  href={DEMO.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`group ${row}`}
                >
                  <span className="min-w-0 flex-1 truncate">{DEMO.title}</span>
                  <ArrowUpRightIcon className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </li>
            )}
          </ul>
        </section>
      ))}
    </nav>
  );
}
