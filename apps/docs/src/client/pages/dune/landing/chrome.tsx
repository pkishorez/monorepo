import { Router } from '@kestack/kabuki/routing';
import { ArrowLeftIcon } from 'lucide-react';
import { MONOREPO, router } from '../../../../shared/index.ts';
import { COLUMN, FOCUS } from './styles.ts';

/*
 * What is around the page: a bar with the way back to ke stack, dune's
 * name and where to jump to, and a footer saying whose it is.
 */

export const SOURCE = `${MONOREPO}/tree/main/packages/dune`;

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-(--dn-line) bg-(--dn-page)/85 backdrop-blur-md">
      <div className={`${COLUMN} flex h-14 items-center gap-3`}>
        <Router.Link
          to={router.Home()}
          aria-label="Back to ke stack"
          className={`-ml-2 grid size-9 place-items-center rounded-lg text-(--dn-text-3) transition-colors duration-150 hover:bg-(--dn-raised) hover:text-(--dn-text) ${FOCUS}`}
        >
          <ArrowLeftIcon className="size-4" strokeWidth={2} />
        </Router.Link>
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-(--dn-text)">
          <DuneMark className="size-5" />
          dune
          <span className="rounded-full border border-(--dn-line) px-1.5 font-mono text-[10px] leading-4 font-normal text-(--dn-text-3)">
            alpha
          </span>
        </span>
        <nav aria-label="On this page" className="ml-auto flex items-center">
          <a href="#how" className={NAV}>
            How it works
          </a>
          <a href="#api" className={NAV}>
            API
          </a>
          <a
            href={SOURCE}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="dune on GitHub"
            className={`ml-1 grid size-9 place-items-center rounded-lg text-(--dn-text-3) transition-colors duration-150 hover:bg-(--dn-raised) hover:text-(--dn-text) ${FOCUS}`}
          >
            <GithubMark />
          </a>
        </nav>
      </div>
    </header>
  );
}

const NAV = `hidden h-9 items-center rounded-lg px-3 text-sm text-(--dn-text-3) transition-colors duration-150 hover:bg-(--dn-raised) hover:text-(--dn-text) sm:flex ${FOCUS}`;

export function Footer() {
  return (
    <footer className="border-t border-(--dn-line)">
      <div
        className={`${COLUMN} flex flex-wrap items-center justify-between gap-4 py-8 text-[13px] text-(--dn-text-3)`}
      >
        <p>
          dune is part of{' '}
          <Router.Link
            to={router.Home()}
            className={`rounded text-(--dn-text) underline decoration-(--dn-line) underline-offset-4 transition-colors duration-150 hover:decoration-(--dn-text-3) ${FOCUS}`}
          >
            ke stack
          </Router.Link>
          . MIT licensed.
        </p>
        <a
          href={SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded transition-colors duration-150 hover:text-(--dn-text) ${FOCUS}`}
        >
          <GithubMark />
          packages/dune
        </a>
      </div>
    </footer>
  );
}

/** A sun over two dunes: the light, and what it falls on. */
export function DuneMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeWidth={2}
      className={className}
    >
      <circle cx="16.5" cy="7" r="3" fill="var(--dn-accent)" />
      <path
        d="M2 17.5c4-5 8-6.5 12-3.5 2.5 2 5 2.2 8 .5"
        stroke="var(--dn-text)"
      />
      <path d="M2 21.5c6-2.5 12-2.5 20 0" stroke="var(--dn-text-3)" />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
