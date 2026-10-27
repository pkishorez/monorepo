import { SquareTerminalIcon } from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { commandOf } from '../../call/index.ts';
import { Clamped } from '../../../fold/index.ts';
import { Block, type Kind } from '../../output/index.ts';

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
