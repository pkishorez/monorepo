import { raiseKeyboard } from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import { FolderPlusIcon } from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { useEffect, useRef, useState } from 'react';

/*
 * On touch, the foot of a Step's top: its button that makes a place here,
 * such as "New folder", beside the one that finishes on the Step, such as
 * "Open this folder". Making, the two give way to a field for the name
 * and Create; Enter creates too, and Cancel, or Escape, goes back. The
 * on-screen keyboard rises with the field. While the owner makes it, the
 * field waits; made, the Picker goes into it.
 */

export function MakeHere({
  label,
  busy,
  done,
  onMake,
}: {
  /** What making says, such as "New folder". */
  readonly label: string;
  readonly busy: boolean;
  /** The button that finishes on the Step, if it has one. */
  readonly done: React.ReactNode;
  readonly onMake: (name: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (naming) field.current?.focus({ preventScroll: true });
  }, [naming]);
  const valid = name.trim() !== '' && !name.includes('/');
  const create = () => {
    if (valid && !busy) onMake(name.trim());
  };

  if (!naming)
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            raiseKeyboard();
            setNaming(true);
          }}
          className="h-11 shrink-0 gap-2 px-4 text-[15px] active:scale-[0.97]"
        >
          <FolderPlusIcon aria-hidden className="size-4" />
          {label}
        </Button>
        {done}
      </div>
    );

  return (
    <div className="flex gap-2">
      <input
        ref={field}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          // Its own keys: the Picker's never hear them.
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            create();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setNaming(false);
          }
        }}
        disabled={busy}
        placeholder="Folder name"
        aria-label="Name of the new folder"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {busy ? (
        <Button disabled className="h-11 w-24 shrink-0">
          <Spinner />
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            onClick={() => setNaming(false)}
            className="h-11 shrink-0 px-3 text-[15px] text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={create}
            className="h-11 shrink-0 px-4 text-[15px]"
          >
            Create
          </Button>
        </>
      )}
    </div>
  );
}
