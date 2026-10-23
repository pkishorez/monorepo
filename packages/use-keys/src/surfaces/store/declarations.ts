import { describe, stepsOf } from '../../core/binding/index.ts';
import type { Dispatcher } from '../../core/provider/index.ts';
import { holdsMod, type Working } from './actions.ts';

/**
 * Keeps the Keys Provider waiting for exactly the Bindings that work now,
 * each its own Shortcut or Sequence, and says which Sequence is under way.
 */
export const createDeclarations = (
  dispatcher: Dispatcher,
  run: (id: string) => void,
  pendingChanged: () => void,
) => {
  const declared = new Map<string, { said: string; undo: () => void }>();
  const pending = new Map<string, string>();

  const undo = (key: string) => {
    declared.get(key)?.undo();
    declared.delete(key);
    pending.delete(key);
  };

  const settle = (key: string) => {
    if (pending.delete(key)) pendingChanged();
  };

  return {
    /** `inField`: whether Text Entry inside the Active Surface has focus. */
    sync: (working: ReadonlyArray<Working>, inField: boolean) => {
      const wanted = new Map(
        working.map((each) => {
          const { action } = each.live;
          const field = inField && action.inField;
          const key = `${action.id}:${each.index}`;
          const said = `${describe(each.binding)}|${field}`;
          return [key, { each, field, said }] as const;
        }),
      );
      for (const [key, { said }] of declared) {
        if (wanted.get(key)?.said !== said) undo(key);
      }
      for (const [key, { each, field, said }] of wanted) {
        if (declared.has(key)) continue;
        const { binding, live } = each;
        const steps = stepsOf(binding);
        try {
          const off = dispatcher.declare(
            {
              bindings: [binding],
              inTextEntry: holdsMod(binding),
              inField: field,
            },
            {
              commit: () => {
                settle(key);
                run(live.action.id);
              },
              possible: (progress) => {
                const next = progress[0]?.next ?? 0;
                pending.set(key, steps.slice(0, next).map(describe).join(' '));
                pendingChanged();
              },
              cancel: () => settle(key),
              repeat: () => live.action.repeat,
            },
          );
          declared.set(key, { said, undo: off });
        } catch (error) {
          // A Shortcut of the core holds these keys; it keeps them.
          console.error(error);
        }
      }
    },
    /** The steps of the Sequence under way, as people write them. */
    pending: () => pending.values().next().value ?? null,
    clear: () => {
      for (const key of declared.keys()) undo(key);
    },
  };
};
