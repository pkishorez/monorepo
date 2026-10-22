import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/components/command';
import { useState } from 'react';
import { keys } from '../../keys.ts';
import { rank } from './rank.ts';

/*
 * The composer's palette of skills and commands, opened by a `/` at the
 * start of a word or by the Skills button. Typing narrows it, best match
 * first; arrows or Ctrl+N and Ctrl+P move and Enter picks, as cmdk has
 * them. It is open while the isolated `palette` Surface is Active: Escape
 * clears the search first, then leaves it, which closes it with nothing
 * picked, back where it was opened. Opened before the skills arrive, it
 * says they are loading and fills in when they come; when they could not
 * be read, it says why. It belongs to one composer, not to the app.
 */

export interface PaletteEntry {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string | undefined;
}

export function Palette({
  commands,
  skills,
  loading,
  problem,
  onPick,
  onClose,
}: {
  readonly commands: ReadonlyArray<PaletteEntry>;
  readonly skills: ReadonlyArray<PaletteEntry>;
  /** The skills have not arrived yet. */
  readonly loading: boolean;
  /** Why the skills could not be read; null when they were. */
  readonly problem: string | null;
  readonly onPick: (name: string) => void;
  /** It closed, by a pick or not. */
  readonly onClose?: () => void;
}) {
  const [query, setQuery] = useState('');
  const { active } = keys.useSurface('palette');
  const { leave } = keys.useKeyboard();
  keys.useAction('palette.clear', () => setQuery(''), {
    enabled: query !== '',
  });
  const groups = [
    { heading: 'Commands', found: rank(commands, query) },
    { heading: 'Skills', found: rank(skills, query) },
  ].filter(({ found }) => found.length > 0);
  return (
    <CommandDialog
      open={active}
      onOpenChange={(next, details) => {
        // Escape goes through the Surface's order instead.
        if (details.reason === 'escape-key') {
          details.cancel();
          details.allowPropagation();
          return;
        }
        if (!next) leave('palette');
      }}
      title="Skills and commands"
      description="Pick one to add to the message"
      className="sm:max-w-lg"
    >
      <keys.Surface
        id="palette"
        asChild
        onExit={() => {
          setQuery('');
          onClose?.();
        }}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search skills and commands"
          />
          <CommandList className="max-h-[min(22rem,55dvh)]">
            <CommandEmpty
              className={problem !== null ? 'px-4 text-destructive' : undefined}
            >
              {problem !== null
                ? `Couldn't load skills: ${problem}`
                : loading
                  ? 'Loading skills…'
                  : 'No skill or command by that name'}
            </CommandEmpty>
            {groups.map(({ heading, found }) => (
              <CommandGroup key={heading} heading={heading}>
                {found.map(({ entry, matched }) => (
                  <CommandItem
                    key={entry.name}
                    value={entry.name}
                    onSelect={() => onPick(entry.name)}
                    className="flex-col items-stretch gap-0.5 [&>svg:last-child]:hidden"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-medium">
                        /<Highlighted text={entry.name} matched={matched} />
                      </span>
                      {entry.argumentHint && (
                        <span className="truncate text-xs text-muted-foreground">
                          {entry.argumentHint}
                        </span>
                      )}
                    </span>
                    {entry.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {groups.length > 0 && problem !== null && (
              <p role="alert" className="px-3 py-2 text-xs text-destructive">
                Couldn't load skills: {problem}
              </p>
            )}
            {groups.length > 0 && problem === null && loading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Loading skills…
              </p>
            )}
          </CommandList>
        </Command>
      </keys.Surface>
    </CommandDialog>
  );
}

function Highlighted({
  text,
  matched,
}: {
  readonly text: string;
  readonly matched: ReadonlyArray<number>;
}) {
  if (matched.length === 0) return text;
  const at = new Set(matched);
  return [...text].map((letter, index) =>
    at.has(index) ? (
      <span
        key={index}
        className="text-foreground underline underline-offset-2"
      >
        {letter}
      </span>
    ) : (
      letter
    ),
  );
}
