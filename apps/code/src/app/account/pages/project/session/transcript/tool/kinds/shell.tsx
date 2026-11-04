import { SquareTerminalIcon, SearchIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { commandOf } from '../parse/index.ts';
import { Clamped } from '../../words/index.ts';
import { Block, type Kind, Output } from '../output/index.ts';

/*
 * Tools that run in the shell: a command, or a search of the files.
 */

/**
 * A command run: opened, a terminal, the command after its prompt and what
 * it printed under it; while it runs, a wait for its output; red when it
 * failed.
 */
export const bash: Kind = {
  icon: SquareTerminalIcon,
  Detail: ({ row, opening }) => {
    const { result } = row;
    return (
      <Block>
        <span className="text-muted-foreground select-none">$ </span>
        <span className="text-foreground">{commandOf(row.call)}</span>
        {result === null ? (
          row.state === 'running' && (
            <span className="mt-2 flex items-center gap-2 font-sans text-muted-foreground">
              <Spinner className="size-3" /> Waiting for its output…
            </span>
          )
        ) : (
          <span
            className={`mt-2 block ${result.isError ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            <Clamped
              id={`${row.id}:output`}
              opening={opening}
              text={result.output || '(no output)'}
            />
          </span>
        )}
        {result?.truncated && (
          <span className="mt-1 block font-sans text-muted-foreground">
            Output cut short
          </span>
        )}
      </Block>
    );
  },
};

/** A search of the files: opened, what it found. */
export const search: Kind = {
  icon: SearchIcon,
  Detail: ({ row, opening }) => (
    <Output row={row} opening={opening} label="What it found" />
  ),
};
