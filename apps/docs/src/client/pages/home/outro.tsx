import { shapeAt } from '../../field/index.ts';
import { ArrowRightIcon } from '@kestack/web-platform/ui/components/lucide';
import { ToolkitLink, column } from '../../components/index.ts';

/*
 * The end of the story: where to begin today, which is kabuki, the one
 * with docs, and where the code is.
 */

export function Outro() {
  return (
    <section
      {...shapeAt('outro')}
      aria-labelledby="outro"
      className="flex min-h-[110svh] flex-col justify-end"
    >
      <div className={`${column} pb-24 sm:pb-32`}>
        <p className="font-mono text-xs text-muted-foreground">
          that’s the stack
        </p>
        <h2
          id="outro"
          className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          Start with kabuki. It’s the one with docs today.
        </h2>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ToolkitLink
            id="kabuki"
            className="group inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-5 text-sm font-medium text-background"
          >
            Read the kabuki docs
            <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </ToolkitLink>
          <a
            href="https://github.com/pkishorez/monorepo"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-full border border-border bg-background px-5 text-sm font-medium transition-colors hover:border-foreground/30"
          >
            The code on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
