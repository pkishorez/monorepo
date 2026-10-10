import { Schema } from 'effect';

/*
 * The todo list as data: its Schemas, and what each change does to it.
 * Nothing here knows the Actor; todo.ts decides when each change happens.
 */

export const Todo = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  completed: Schema.Boolean,
  createdAt: Schema.Number,
});
export type Todo = typeof Todo.Type;

export const TodoList = Schema.Array(Todo);
export type TodoList = typeof TodoList.Type;

export const Filter = Schema.Literals(['All', 'Active', 'Completed']);
export type Filter = typeof Filter.Type;

/** Which todo is being edited, if any, and its text so far. */
export const Editing = Schema.TaggedUnion({
  NotEditing: {},
  Editing: { id: Schema.String, text: Schema.String },
});
export type Editing = typeof Editing.Type;

export const toggle = (todos: TodoList, id: string): TodoList =>
  todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo,
  );

export const remove = (todos: TodoList, id: string): TodoList =>
  todos.filter((todo) => todo.id !== id);

export const rename = (todos: TodoList, id: string, text: string): TodoList =>
  todos.map((todo) => (todo.id === id ? { ...todo, text } : todo));

/** Every todo done, unless every todo is already done: then none. */
export const toggleAll = (todos: TodoList): TodoList => {
  const allDone = todos.every((todo) => todo.completed);
  return todos.map((todo) => ({ ...todo, completed: !allDone }));
};

export const clearCompleted = (todos: TodoList): TodoList =>
  todos.filter((todo) => !todo.completed);

export const shown = (todos: TodoList, filter: Filter): TodoList =>
  filter === 'All'
    ? todos
    : todos.filter((todo) => todo.completed === (filter === 'Completed'));
