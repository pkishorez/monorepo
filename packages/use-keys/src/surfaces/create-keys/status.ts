import type { Shortcut } from '../../core/binding/index.ts';
import { stepsOf } from '../../core/binding/index.ts';
import type { Progress } from '../../core/provider/index.ts';
import type { ActionState, Resolution } from '../surface-tree/index.ts';

/** Where the keyboard stands right now. */
export type Status<SurfaceId, ActionId> = {
  readonly surface: SurfaceId | null;
  /** Every Action in the definition, in the order written. */
  readonly actions: ReadonlyArray<{
    readonly id: ActionId;
    readonly description: string;
    readonly bindings: Resolution['actions'][number]['bindings'];
    readonly state: ActionState;
  }>;
  /** A Sequence under way, and every way to finish it. */
  readonly sequence:
    | { readonly type: 'idle' }
    | {
        readonly type: 'possible';
        /** The steps pressed so far. */
        readonly pressed: ReadonlyArray<Shortcut>;
        readonly next: ReadonlyArray<{
          readonly id: ActionId;
          readonly description: string;
          readonly step: Shortcut;
        }>;
      };
};

/**
 * The status from a Resolution and the Sequences under way. `progress`
 * counts a Binding among the ones that work, as they were declared.
 */
export const statusOf = (
  surface: string | null,
  resolution: Resolution,
  under: ReadonlyMap<string, ReadonlyArray<Progress>>,
): Status<string, string> => {
  const next = [...under].flatMap(([id, progress]) => {
    const action = resolution.actions.find((each) => each.id === id);
    if (action === undefined) return [];
    const working = action.bindings.filter(({ works }) => works);
    return progress.flatMap(({ binding, next: at }) => {
      const found = working[binding]?.binding;
      if (found === undefined) return [];
      const steps = stepsOf(found);
      const step = steps[at];
      if (step === undefined) return [];
      return [
        {
          id,
          description: action.description,
          step,
          pressed: steps.slice(0, at),
        },
      ];
    });
  });
  return {
    surface,
    actions: resolution.actions,
    sequence:
      next.length === 0
        ? { type: 'idle' }
        : {
            type: 'possible',
            pressed: next[0]?.pressed ?? [],
            next: next.map(({ id, description, step }) => ({
              id,
              description,
              step,
            })),
          },
  };
};
