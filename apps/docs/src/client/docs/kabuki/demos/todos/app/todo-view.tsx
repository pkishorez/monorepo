import { useState } from 'react';
import { motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Input } from '@kestack/web-platform/components/input';
import { TodoLive } from './todos.ts';

// Draws one to-do's text, struck through when its Prop says done: the line
// draws across it, left to right, and the text greys. Click it to rename
// it; the new text is sent only when you finish.
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
      className={`h-9 min-w-0 flex-1 truncate rounded-md px-2.5 text-left text-sm transition-colors duration-200 hover:bg-muted ${
        props.done ? 'text-muted-foreground' : ''
      }`}
    >
      <span className="relative">
        {model.text}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scaleX: props.done ? 1 : 0 }}
          transition={{
            duration: props.done ? 0.25 : 0.15,
            ease: props.done ? [0.23, 1, 0.32, 1] : [0.4, 0, 1, 1],
          }}
          className={`absolute inset-x-0 top-1/2 h-px bg-current ${
            props.done ? 'origin-left' : 'origin-right'
          }`}
        />
      </span>
    </button>
  );
});
