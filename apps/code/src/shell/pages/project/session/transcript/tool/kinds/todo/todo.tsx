import { ListTodoIcon } from '@kestack/web-platform/ui/components/lucide';
import { Checklist } from '../../../checklist/index.ts';
import { type Kind, Output } from '../../output/index.ts';

/** The agent's to-do list, as it wrote it: opened, each step and where it stands. */
export const todo: Kind = {
  icon: ListTodoIcon,
  Detail: ({ row, opening }) => {
    const todos = (row.call.input as { todos?: unknown } | null)?.todos;
    if (!Array.isArray(todos)) return <Output row={row} opening={opening} />;
    return (
      <Checklist
        steps={todos.flatMap((todo: unknown) => {
          const { content, status } = (todo ?? {}) as Record<string, unknown>;
          return typeof content === 'string'
            ? [
                {
                  text: content,
                  status: typeof status === 'string' ? status : '',
                },
              ]
            : [];
        })}
      />
    );
  },
};
