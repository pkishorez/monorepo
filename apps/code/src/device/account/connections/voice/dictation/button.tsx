import { useChild } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { MicIcon, SquareIcon } from 'lucide-react';
import { use, type ContextType } from 'react';
import { Dictating } from './view.tsx';

/*
 * The mic Layout draws in the header, on every page, Settings too: it
 * starts a Dictation, and stops the one recording, wherever it started.
 * It reads only whether one is starting or recording.
 */

export function DictationButton({ keys }: { readonly keys: string | null }) {
  const dictating = use(Dictating);
  if (dictating === null) return null;
  return <Mic dictating={dictating} keys={keys} />;
}

function Mic({
  dictating: { dictation, ask },
  keys,
}: {
  readonly dictating: NonNullable<ContextType<typeof Dictating>>;
  readonly keys: string | null;
}) {
  const on = useChild(
    dictation,
    ({ state }) => state._tag === 'Waiting' || state._tag === 'Recording',
  );
  const label = on ? 'Stop the Dictation' : 'Dictate';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => ask({ _tag: 'Toggle' })}
      aria-label={label}
      aria-pressed={on === true}
      title={keys === null ? label : `${label} (${keys})`}
      className="size-8 shrink-0 text-muted-foreground aria-pressed:bg-destructive/10 aria-pressed:text-destructive"
    >
      {on ? <SquareIcon className="fill-current" /> : <MicIcon />}
    </Button>
  );
}
