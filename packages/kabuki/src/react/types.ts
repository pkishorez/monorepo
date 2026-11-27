import type { Defined, Only } from '../core/actor/index.ts';
import type { Root } from './view/index.ts';

export type {
  AppRuntime,
  Attachment,
  ChildData,
  Handle,
  KabukiProps,
  Root,
  Step,
  ViewOf,
  ViewProps,
} from './view/index.ts';

/**
 * What a View draws from, typed from the Actor's Shape alone,
 * `typeof FolderViewerShape`: `ViewProps` without its Children and
 * Address, which only the built Actor knows. For a component the View
 * renders and hands each Child's View to as a prop of its own.
 */
export type ViewPropsOf<S> =
  S extends Defined<
    any,
    any,
    infer Props,
    infer Model,
    infer State,
    infer Msg,
    any,
    any,
    any
  >
    ? {
        [T in State['_tag']]: {
          readonly _tag: T;
          readonly model: Model;
          readonly state: Only<State, T>;
          /** What its parent hands it now. */
          readonly props: Props;
          readonly send: (message: Msg) => void;
          /** Spread on the element drawn as its root: `<li {...root}>`. */
          readonly root: Root;
        };
      }[State['_tag']]
    : never;
