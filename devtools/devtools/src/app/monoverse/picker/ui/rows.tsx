import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderSymlinkIcon,
  XIcon,
} from 'lucide-react';
import { memo, type MouseEvent } from 'react';
import type { Kind, Ranked, Row } from '../steps/index.js';

/*
 * One row of the list, as an option of its listbox: the search field keeps
 * the keys, and the row highlighted is lit. A Project shows its name over
 * its folder, `~`-shortened, with a quiet mark on the one open now and a
 * button that removes it from the list, shown on the row highlighted or
 * hovered, and always to a finger. "Open a folder…" is the action that
 * adds one. A folder shows what it would open as, and a chevron saying
 * Enter goes into it.
 */

const keepFocus = (event: MouseEvent) => event.preventDefault();

/** What a folder would open as, quietly; nothing for a plain folder. */
export function KindTag({ kind }: { readonly kind: Kind }) {
  if (kind === null) return null;
  return (
    <span className="shrink-0 rounded-[5px] border border-border/70 px-1.5 text-[11px] leading-[18px] text-muted-foreground">
      {kind}
    </span>
  );
}

export const Option = memo(function Option({
  id,
  row,
  matched,
  active,
  onHover,
  onPick,
  onRemove,
}: {
  readonly id: string;
  readonly row: Row;
  readonly matched: Ranked<Row>['matched'];
  readonly active: boolean;
  readonly onHover: (value: string) => void;
  readonly onPick: (value: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      onMouseDown={keepFocus}
      onPointerMove={(event) => {
        if (!active && event.pointerType === 'mouse') onHover(row.value);
      }}
      onClick={() => onPick(row.value)}
      className={cn(
        'group/row relative flex cursor-default items-center gap-3 rounded-lg px-2.5 select-none data-active:bg-muted',
        row._tag === 'Folder'
          ? 'h-9 pointer-coarse:h-12'
          : 'h-12 pointer-coarse:h-14',
      )}
    >
      {row._tag === 'Folder' ? (
        <>
          {row.folder.link ? (
            <FolderSymlinkIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : (
            <FolderIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
          <span className="min-w-0 flex-1 truncate">
            <Lit text={row.label} matched={matched} />
            {row.folder.link && <span className="sr-only"> (link)</span>}
          </span>
          <KindTag kind={row.folder.kind} />
          <ChevronRightIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/60 opacity-0 group-data-active/row:opacity-100 pointer-coarse:opacity-100"
          />
        </>
      ) : (
        <>
          <span
            aria-hidden
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-md',
              row._tag === 'OpenFolder'
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground ring-1 ring-border/60',
            )}
          >
            {row._tag === 'OpenFolder' ? (
              <FolderPlusIcon className="size-4" />
            ) : (
              <FolderIcon className="size-4" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">
                <Lit text={row.label} matched={matched} />
              </span>
              {row._tag === 'Project' && row.current && (
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-emerald-500"
                  />
                  Open now
                </span>
              )}
            </span>
            <span
              className={cn(
                'truncate text-xs text-muted-foreground',
                row._tag === 'Project' && 'font-mono text-[11.5px]',
              )}
            >
              {row.detail}
            </span>
          </span>
          {row._tag === 'Project' && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${row.label} from the list`}
              title="Remove from the list (Shift+Delete)"
              onMouseDown={keepFocus}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(row.project.id);
              }}
              className="relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] duration-150 group-hover/row:opacity-100 group-data-active/row:opacity-100 before:absolute before:-inset-1.5 hover:bg-background hover:text-foreground active:scale-[0.96] pointer-coarse:size-10 pointer-coarse:opacity-100"
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
});

/** The label, its matching letters lit and the rest quieter, while searching. */
function Lit({
  text,
  matched,
}: {
  readonly text: string;
  readonly matched: ReadonlyArray<number>;
}) {
  if (matched.length === 0) return text;
  const at = new Set(matched);
  return (
    <span className="text-foreground/65">
      {[...text].map((letter, index) =>
        at.has(index) ? (
          <span key={index} className="text-foreground">
            {letter}
          </span>
        ) : (
          letter
        ),
      )}
    </span>
  );
}
