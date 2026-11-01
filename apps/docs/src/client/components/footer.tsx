import { ArrowUpRightIcon } from 'lucide-react';
import { column } from './styles.ts';

/**
 * What it is built with, and who made it, as a link that reads as one.
 * It sits on its own ground above the particle field (field.tsx's stage
 * and its phone curtain go up to z-[3]), so it reads the same on every
 * page, whether the field there has faded out by the end or not.
 */
export function Footer() {
  return (
    <footer className="relative z-[4] border-t border-border bg-background">
      <div
        className={`${column} flex flex-wrap items-center justify-between gap-2 py-6 text-xs text-muted-foreground`}
      >
        <span>Built with kabuki start.</span>
        <a
          href="https://kishore.app"
          target="_blank"
          rel="noreferrer"
          className="group -my-2 inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors duration-150 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          kishore.app
          <ArrowUpRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
        </a>
      </div>
    </footer>
  );
}
