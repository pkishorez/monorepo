import { Fragment, useEffect, useRef, type ReactNode } from 'react';

import { ArrowRight } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import type { RuleEntry } from '../laymo-edges';

/**
 * The Rule list: every Rule in Config order, then every Exception with its
 * Reason. Choosing one shows it on the Laymo; choosing it again lets go.
 * The entries a selected card lights are marked, and unused ones are muted.
 */
export function RuleList({
  entries,
  selectedId,
  litIds,
  onChoose,
}: {
  readonly entries: readonly RuleEntry[];
  readonly selectedId: string | undefined;
  readonly litIds: ReadonlySet<string> | undefined;
  readonly onChoose: (entry: RuleEntry) => void;
}) {
  const rules = entries.filter((entry) => entry.kind === 'rule');
  const exceptions = entries.filter((entry) => entry.kind === 'exception');
  const items = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (selectedId !== undefined)
      items.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const item = (entry: RuleEntry) => {
    const selected = selectedId === entry.id;
    const lit = !selected && litIds?.has(entry.id) === true;
    return (
      <li key={entry.id}>
        <button
          ref={(element) => {
            if (element === null) items.current.delete(entry.id);
            else items.current.set(entry.id, element);
          }}
          type="button"
          aria-pressed={selected}
          onClick={() => onChoose(entry)}
          title={
            entry.unused
              ? 'No import uses it'
              : entry.from === '*'
                ? `Every sibling of ${entry.to} may import it`
                : undefined
          }
          className={cn(
            'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1 text-start transition-colors',
            selected
              ? 'bg-foreground/12'
              : lit
                ? 'bg-foreground/[0.05]'
                : 'hover:bg-muted',
            entry.unused && !selected && 'opacity-55',
          )}
        >
          <span
            className={cn(
              'w-full break-words font-mono text-[11.5px] leading-snug',
              entry.kind === 'exception' && 'italic',
            )}
          >
            <BreakablePath path={entry.from} />
            <ArrowRight
              aria-label="may import"
              className="mx-1 inline size-3 align-[-2px] text-muted-foreground"
            />
            <BreakablePath path={entry.to} />
          </span>
          {entry.because !== undefined && (
            <span className="line-clamp-2 text-[11px] text-muted-foreground">
              {entry.because}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3 p-1.5">
      <Group title="Rules" count={rules.length}>
        {rules.map(item)}
      </Group>
      {exceptions.length > 0 && (
        <Group title="Exceptions" count={exceptions.length}>
          {exceptions.map(item)}
        </Group>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h4 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title} <span className="tabular-nums">{count}</span>
      </h4>
      {count === 0 ? (
        <p className="px-2 text-[12px] italic text-muted-foreground">
          None: no Module imports another.
        </p>
      ) : (
        <ul className="flex flex-col gap-px">{children}</ul>
      )}
    </section>
  );
}

/** A path that may wrap after any `/`, never inside a name. */
function BreakablePath({ path }: { readonly path: string }) {
  return path.split('/').map((segment, index) => (
    <Fragment key={index}>
      {index > 0 && (
        <>
          /<wbr />
        </>
      )}
      {segment}
    </Fragment>
  ));
}
