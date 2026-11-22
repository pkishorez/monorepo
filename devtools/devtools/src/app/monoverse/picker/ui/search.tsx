import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { keepFocus } from './trail.js';

/*
 * The search field, which keeps the keys while the Picker is open: a
 * combobox over the list, taking focus as it opens, but never on a device
 * with only a finger, where it waits to be tapped. A spinner says the
 * server is asked; with something typed, a button clears it.
 */

const fingerOnly = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(pointer: coarse)').matches &&
  !matchMedia('(hover: hover)').matches;

export function Search({
  query,
  placeholder,
  loading,
  readOnly,
  listId,
  activeId,
  onType,
  onKeyDown,
}: {
  readonly query: string;
  readonly placeholder: string;
  readonly loading: boolean;
  readonly readOnly: boolean;
  readonly listId: string;
  /** The option highlighted, for a screen reader to follow. */
  readonly activeId: string | undefined;
  readonly onType: (query: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!fingerOnly()) field.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="relative h-12 shrink-0 border-b border-border/60">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={field}
        type="text"
        role="combobox"
        aria-label={placeholder}
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={query}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onType(event.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        data-1p-ignore
        data-lpignore="true"
        className="size-full bg-transparent pr-11 pl-10 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/80 pointer-coarse:text-base"
      />
      <div className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center">
        {loading ? (
          <Spinner className="size-3.5 text-muted-foreground" />
        ) : (
          query !== '' && (
            <button
              type="button"
              aria-label="Clear the search"
              onMouseDown={keepFocus}
              onClick={() => {
                onType('');
                field.current?.focus({ preventScroll: true });
              }}
              className="relative grid size-6 place-items-center rounded-full text-muted-foreground transition-[color,background-color] duration-150 before:absolute before:-inset-2 hover:bg-muted hover:text-foreground active:scale-[0.96]"
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          )
        )}
      </div>
    </div>
  );
}
