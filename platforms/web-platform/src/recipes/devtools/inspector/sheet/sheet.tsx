import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../../../ui/components/kit/class-names.ts';
import { JsonTree } from '../../../../ui/viewers/json/index.ts';
import { ink } from '../ink/index.ts';
import type { Tone } from '../ink/index.ts';

/*
 * The Sheet: the data of what is picked, over the Map.
 *
 * 1. Open   it slides in quickly, and away when closed. Picking something
 *           else changes what it says in place: it never closes and opens
 *           again.
 * 2. Fit    on a wide Inspector it is a panel floating on the Map's right,
 *           as tall as it needs and no taller than the Map; on a narrow one
 *           it is a drawer from the bottom, the full width. Either way
 *           everything is stacked, since every value is a tree that grows
 *           down.
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
        'bg-popover text-popover-foreground absolute z-30 flex flex-col overflow-hidden border',
        'shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_rgb(0_0_0/0.16)]',
        // 2. Fit: a drawer from the bottom when narrow, a panel on the right when wide.
        'inset-x-0 bottom-0 max-h-[70%] rounded-t-xl border-b-0',
        '@3xl:inset-x-auto @3xl:top-3 @3xl:right-3 @3xl:bottom-auto @3xl:max-h-[calc(100%-1.5rem)] @3xl:w-88 @3xl:rounded-xl @3xl:border-b',
      )}
      initial={still ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        still
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, y: 8, transition: { duration: 0.12, ease: 'easeIn' } }
      }
      transition={{ duration: 0.2, ease: OUT }}
    >
      {/* 3. Read: what it is */}
      <header className="flex shrink-0 items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: ink(tone) }}
            />
            {kind}
          </p>
          <h2 className="mt-0.5 truncate text-[15px] font-semibold">{title}</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground hover:bg-muted -mr-1.5 grid size-8 shrink-0 place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 [&_svg]:size-4"
        >
          <X />
        </button>
      </header>

      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-3.5">
        {facts.length > 0 && (
          <dl className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-4 gap-y-2 text-xs">
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
              <p className="text-muted-foreground text-xs">None running.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
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
                    <span className="text-muted-foreground">{row.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </Part>
        )}

        {/* 3. Read: each value */}
        {sections.map((section) => (
          <Part key={section.title} title={section.title}>
            {section.value !== null && typeof section.value === 'object' ? (
              <div className="bg-muted/40 -mx-1 rounded-lg px-2.5 py-2">
                <JsonTree value={section.value} collapsed={3} tone="syntax" />
              </div>
            ) : (
              <p className="font-mono text-xs">
                {JSON.stringify(section.value) ?? 'nothing'}
              </p>
            )}
          </Part>
        ))}
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
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className="text-muted-foreground text-[11px] font-medium">{title}</h3>
      {children}
    </section>
  );
}
