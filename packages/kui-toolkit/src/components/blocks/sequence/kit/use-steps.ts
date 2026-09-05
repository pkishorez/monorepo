import { useReducer } from 'react';

import type { SequenceController, Step } from '../internal';

type State = { index: number; override: { props: unknown } | null };

type Action =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'restart' }
  | { type: 'go'; index: number; override: { props: unknown } | null };

function reducer(total: number) {
  return (state: State, action: Action): State => {
    switch (action.type) {
      case 'next':
        return { index: Math.min(state.index + 1, total - 1), override: null };
      case 'prev':
        return { index: Math.max(state.index - 1, 0), override: null };
      case 'restart':
        return { index: 0, override: null };
      case 'go':
        return { index: action.index, override: action.override };
    }
  };
}

/**
 * Drives a list of {@link step}s as a sequence. The declared order *is* the
 * timeline: `next`/`prev` walk it (clamped), `restart` jumps to the first
 * frame, and `go(name)` jumps to a named frame — optionally with overridden
 * props for that visit (`go(name, props)`), otherwise the step's default.
 * Holds only the current index and any active override; `active` is the frame
 * to hand to `<Screen>`.
 *
 * @param steps frames in display order, each from {@link step}
 */
export function useSteps<const S extends readonly Step[]>(
  ...steps: S
): SequenceController<S> {
  const total = steps.length;
  const [state, dispatch] = useReducer(reducer(total), {
    index: 0,
    override: null,
  });

  const base = steps[Math.min(state.index, total - 1)];
  const active = (
    state.override ? { ...base, props: state.override.props } : base
  ) as S[number];

  return {
    active,
    index: state.index,
    total,
    next: () => dispatch({ type: 'next' }),
    prev: () => dispatch({ type: 'prev' }),
    restart: () => dispatch({ type: 'restart' }),
    go: (name, props) => {
      const index = steps.findIndex((s) => s.name === name);
      dispatch({
        type: 'go',
        index: index < 0 ? 0 : index,
        override: props === undefined ? null : { props },
      });
    },
  };
}
