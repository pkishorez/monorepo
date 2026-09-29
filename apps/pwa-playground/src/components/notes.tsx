import { ChevronRightIcon, InfoIcon } from '@kstackz/ui-toolkit/lucide';
import type { ReactNode } from 'react';

const INLINE_CODE =
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-foreground';

/** What to look for while playing: three points, not ten. */
export function Notice(props: { readonly items: ReadonlyArray<ReactNode> }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">What to notice</h2>
      <ol
        className={`flex max-w-[65ch] flex-col gap-2.5 text-[15px] leading-relaxed ${INLINE_CODE}`}
      >
        {props.items.map((item, i) => (
          <li key={i} className="grid grid-cols-[1.75rem_1fr]">
            <span
              aria-hidden="true"
              className="font-mono text-xs leading-[1.7rem] text-muted-foreground tabular-nums"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The full test script, folded away until someone wants every edge case. */
export function Checklist(props: {
  readonly steps: ReadonlyArray<ReactNode>;
  readonly title?: string;
}) {
  return (
    <details className="group rounded-xl ring-1 ring-foreground/10 open:bg-muted/20">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
        />
        {props.title ?? 'Test it thoroughly'}
        <span className="ml-auto font-mono text-xs font-normal text-muted-foreground tabular-nums">
          {props.steps.length} steps
        </span>
      </summary>
      <ol
        className={`flex max-w-[70ch] flex-col gap-2.5 px-4 pb-4 text-sm leading-relaxed ${INLINE_CODE}`}
      >
        {props.steps.map((step, i) => (
          <li key={i} className="grid grid-cols-[1.75rem_1fr]">
            <span
              aria-hidden="true"
              className="font-mono text-xs leading-[1.6rem] text-muted-foreground tabular-nums"
            >
              {i + 1}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** One line of context the demo needs: a browser, a deploy, a setting. */
export function Hint(props: { readonly children: ReactNode }) {
  return (
    <p
      className={`flex max-w-[65ch] gap-2.5 rounded-lg bg-muted/50 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground ${INLINE_CODE}`}
    >
      <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{props.children}</span>
    </p>
  );
}
