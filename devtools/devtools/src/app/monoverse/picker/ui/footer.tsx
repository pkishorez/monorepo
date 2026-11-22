import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ReactNode } from 'react';
import { isMac } from './keys.js';

/*
 * The foot of the Picker: the keys that do something now, for a device
 * with a keyboard, or what is being added while the server adds it.
 */

export function Footer({
  inFolder,
  query,
  project,
  canBack,
  adding,
}: {
  readonly inFolder: boolean;
  readonly query: string;
  /** A Project is highlighted, which can be removed. */
  readonly project: boolean;
  readonly canBack: boolean;
  /** The folder being added, `~`-shortened. */
  readonly adding: string | null;
}) {
  const mod = isMac() ? '⌘' : 'Ctrl';
  if (adding !== null)
    return (
      <p
        role="status"
        className="flex h-9 shrink-0 items-center gap-2 border-t border-border/60 px-3 text-xs text-muted-foreground"
      >
        <Spinner className="size-3.5" />
        <span className="truncate">
          Adding <span className="font-mono">{adding}</span>…
        </span>
      </p>
    );
  return (
    <div
      aria-hidden
      className="hidden h-9 shrink-0 items-center gap-4 border-t border-border/60 px-3 text-[11px] text-muted-foreground pointer-fine:flex"
    >
      {inFolder ? (
        <>
          <Hint keys={['↵']}>Go in</Hint>
          <Hint keys={[mod, '↵']}>Open as project</Hint>
          {canBack && query === '' && <Hint keys={['⌫']}>Back</Hint>}
        </>
      ) : (
        <>
          <Hint keys={['↵']}>Open</Hint>
          {project && query === '' && <Hint keys={[mod, '⌫']}>Remove</Hint>}
        </>
      )}
      <span className="ml-auto">
        <Hint keys={['esc']}>{query === '' ? 'Close' : 'Clear'}</Hint>
      </span>
    </div>
  );
}

function Hint({
  keys,
  children,
}: {
  readonly keys: ReadonlyArray<string>;
  readonly children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {keys.map((key) => (
          <Kbd key={key} className="h-[18px] min-w-[18px] text-[10.5px]">
            {key}
          </Kbd>
        ))}
      </span>
      {children}
    </span>
  );
}
