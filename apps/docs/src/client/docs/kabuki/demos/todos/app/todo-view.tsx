import { useState } from 'react';
import { View } from '@kestack/kabuki/react';
import { Input } from '@kestack/web-platform/components/input';
import { TodoLive } from './todos.ts';

// Draws one to-do's text, struck through when its Prop says done. Click
// it to rename it; the new text is sent only when you finish.
export const TodoView = View.make(TodoLive, ({ model, props, send, root }) => {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const save = () => {
      const text = draft.trim();
      if (text && text !== model.text) send({ _tag: 'Renamed', text });
      setDraft(null);
    };
    return (
      <form
        {...root}
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Input
          autoFocus
          aria-label="Rename the to-do"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => event.key === 'Escape' && setDraft(null)}
          className="h-9"
        />
      </form>
    );
  }

  return (
    <button
      {...root}
      type="button"
      title="Rename"
      onClick={() => setDraft(model.text)}
      className={`h-9 min-w-0 flex-1 truncate rounded-md px-2.5 text-left text-sm transition-colors hover:bg-muted ${
        props.done ? 'text-muted-foreground line-through' : ''
      }`}
    >
      {model.text}
    </button>
  );
});
