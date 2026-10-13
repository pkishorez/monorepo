import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../../components/lib/utils.ts';
import { JsonTree } from '../../../components/viewers/json/index.ts';
import { ink } from '../ink/index.ts';
import type { Tone } from '../ink/index.ts';

/*
 * The Sheet: the data of what is picked, along the bottom of the Inspector.
 *
 * 1. Open   it grows up from the bottom, quickly, and shrinks away when
 *           closed. Picking something else changes what it says in place:
 *           it never closes and opens again.
 * 2. Fit    on a wide Inspector it is a section of its own under the Map,
 *           what is picked on its left and each value in a column beside
 *           it; on a narrow one it is a drawer over the Map, the full width,
 *           everything stacked.
 * 3. Read   what it is and its name, a few facts, a list such as its
 *           Workers, then each value as a tree.
 */

export interface SheetFact {
  readonly label: string;
  readonly value: ReactNode;
}

export interface SheetRow {
  readonly label: string;
  readonly detail: string;
  readonly tone: Tone;
}

export interface SheetSection {
  readonly title: string;
  readonly value: unknown;
}

const OUT = [0.23, 1, 0.32, 1] as const;

export function Sheet({
  kind,
  tone = 'lit',
  title,
  facts = [],
  rows,
  sections = [],
  onClose,
}: {
  /** What is picked: an Instance, a State, a Worker, the Message. */
  readonly kind: string;
  readonly tone?: Tone;
  readonly title: string;
  readonly facts?: ReadonlyArray<SheetFact>;
  /** A short list, such as Workers, with its title. */
  readonly rows?: {
    readonly title: string;
    readonly items: ReadonlyArray<SheetRow>;
  };
  readonly sections?: ReadonlyArray<SheetSection>;
  readonly onClose: () => void;
}) {
  const still = useReducedMotion();
  return (
    // 1. Open
    <motion.section
      aria-label={`${kind} ${title}`}
      className={cn(
        // 2. Fit: a drawer over the Map when narrow, a section under it when wide.
        'bg-background absolute inset-x-0 bottom-0 z-30 flex max-h-[65%] flex-col overflow-hidden border-t @3xl:max-h-72',
        'rounded-t-xl shadow-[0_-1px_2px_rgb(0_0_0/0.04),0_-8px_24px_rgb(0_0_0/0.08)]',
        '@3xl:relative @3xl:z-auto @3xl:shrink-0 @3xl:rounded-none @3xl:shadow-none',
      )}
      initial={still ? false : { height: 0 }}
      animate={{ height: 'auto' }}
      exit={
        still
          ? { height: 0, transition: { duration: 0 } }
          : { height: 0, transition: { duration: 0.12, ease: 'easeIn' } }
      }
      transition={{ duration: 0.18, ease: OUT }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 3. Read: what it is */}
        <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <p
              className="text-[10.5px] font-medium tracking-wider uppercase"
              style={{ color: ink(tone) }}
            >
              {kind}
            </p>
            <h2 className="truncate text-sm font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted grid size-8 shrink-0 place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 [&_svg]:size-4"
          >
            <X />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 @3xl:flex-row @3xl:gap-6 @3xl:overflow-x-auto @3xl:overflow-y-hidden">
          {(facts.length > 0 || rows) && (
            <div className="flex shrink-0 flex-col gap-4 @3xl:w-64 @3xl:overflow-y-auto">
              {facts.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  {facts.map((fact) => (
                    <div key={fact.label} className="contents">
                      <dt className="text-muted-foreground">{fact.label}</dt>
                      <dd className="min-w-0 truncate font-mono text-[11.5px]">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {rows && (
                <Part title={rows.title}>
                  {rows.items.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      None running.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {rows.items.map((row) => (
                        <li
                          key={row.label}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: ink(row.tone) }}
                          />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                            {row.label}
                          </span>
                          <span className="text-muted-foreground">
                            {row.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Part>
              )}
            </div>
          )}

          {/* 3. Read: each value */}
          {sections.map((section) => (
            <Part
              key={section.title}
              title={section.title}
              className="@3xl:w-80 @3xl:shrink-0 @3xl:overflow-y-auto"
            >
              {section.value !== null && typeof section.value === 'object' ? (
                <div className="bg-muted/40 rounded-lg border p-2">
                  <JsonTree value={section.value} collapsed={2} tone="syntax" />
                </div>
              ) : (
                <p className="font-mono text-xs">
                  {JSON.stringify(section.value) ?? 'nothing'}
                </p>
              )}
            </Part>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function Part({
  title,
  className,
  children,
}: {
  readonly title: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-1.5', className)}>
      <h3 className="text-muted-foreground text-[10.5px] font-medium tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
