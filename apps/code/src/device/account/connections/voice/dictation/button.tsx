import { useChild } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { XIcon } from 'lucide-react';
import { use, type ContextType } from 'react';
import { Dictating } from './view.tsx';

/*
 * What Layout draws in the header, on every page, Settings too: while a
 * Dictation starts, records or is written out, wherever it was started,
 * a button that throws it away. A Dictation is started from its field,
 * so there is nothing here while none is going. It reads only whether one
 * is going.
 */

export function DictationButton() {
  const dictating = use(Dictating);
  if (dictating === null) return null;
  return <Cancel dictating={dictating} />;
}

function Cancel({
  dictating: { dictation, ask },
}: {
  readonly dictating: NonNullable<ContextType<typeof Dictating>>;
}) {
  const going = useChild(
    dictation,
    ({ state }) =>
      state._tag === 'Waiting' ||
      state._tag === 'Recording' ||
      state._tag === 'Transcribing',
  );
  if (going !== true) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => ask({ _tag: 'Cancel' })}
      aria-label="Cancel the Dictation"
      title="Cancel the Dictation"
      className="size-8 shrink-0 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
    >
      <XIcon />
    </Button>
  );
}
