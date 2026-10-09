import { X } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { Checkbox } from '@kstackz/web-platform/components/checkbox';
import { Input } from '@kstackz/web-platform/components/input';

type Todo = {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
};

/** What a row can ask for; the list turns each into its own Message. */
type Actions = {
  readonly toggle: () => void;
  readonly remove: () => void;
  readonly startEditing: () => void;
  readonly typeEdit: (text: string) => void;
  readonly saveEdit: () => void;
  readonly cancelEdit: () => void;
};

/**
 * One todo: a checkbox, its text and a delete button, or, while `editing`
 * holds its text, a field to rename it.
 */
export const TodoItem = ({
  todo,
  editing,
  actions,
}: {
  readonly todo: Todo;
  readonly editing: string | null;
  readonly actions: Actions;
}) =>
  editing === null ? (
    <li className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60">
      <Checkbox
        checked={todo.completed}
        onCheckedChange={actions.toggle}
        aria-label={todo.text}
      />
      <button
        type="button"
        onClick={actions.startEditing}
        className={`flex-1 text-left text-sm ${todo.completed ? 'text-muted-foreground line-through' : ''}`}
      >
        {todo.text}
      </button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Delete ${todo.text}`}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={actions.remove}
      >
        <X />
      </Button>
    </li>
  ) : (
    <li>
      <form
        className="flex items-center gap-2 px-1 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          actions.saveEdit();
        }}
      >
        <Input
          autoFocus
          aria-label="Edit todo"
          value={editing}
          onChange={(event) => actions.typeEdit(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && actions.cancelEdit()}
        />
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={actions.cancelEdit}
        >
          Cancel
        </Button>
      </form>
    </li>
  );
