/*
 * `View`: how an Actor is drawn, `make`, or loaded when first drawn,
 * `lazy`; and `app`, a View as the whole app, one React component.
 */

export { make, lazy, preload } from '../view/index.ts';
export { app } from '../app/index.ts';

export type {
  /** What a View draws one Instance from. */
  ViewProps as Props,
  /** A View of the Actor `A`. */
  ViewOf as Of,
  /** A lazy View: its code loads the first time it is drawn. */
  LazyView as Lazy,
  ChildData,
  Handle,
  Root,
} from '../view/index.ts';
export type {
  AppSetup,
  AppOptions,
  AppProps,
  AppRuntime,
  Attachment,
} from '../app/index.ts';
