import { useRef } from 'react';
import { Input } from '@kestack/web-platform/ui/components/input';

export function Editor({
  title,
  onSave,
  onCancel,
}: {
  readonly title: string;
  readonly onSave: (title: string) => void;
  readonly onCancel: () => void;
}) {
  const done = useRef(false);
  const finish = (run: () => void) => {
    if (done.current) return;
    done.current = true;
    run();
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('title');
        finish(() => onSave(String(value ?? '')));
      }}
    >
      <Input
        name="title"
        aria-label="Title"
        defaultValue={title}
        autoFocus
        autoComplete="off"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          const value = event.currentTarget.value;
          finish(() => onSave(value));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') finish(onCancel);
        }}
        className="-mx-2 h-7 px-2 text-base sm:text-sm"
      />
    </form>
  );
}
