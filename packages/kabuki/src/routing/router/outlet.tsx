import { Fragment, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Actor } from '../../core/index.ts';
import type { AnyActor } from '../../core/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { inputsUnder, paramsKey, propsOf, valueAt } from '../route/index.ts';
import type {
  AnyNode,
  Children,
  Drawn,
  Failure,
  Inputs,
  Move,
  Value,
} from '../route/index.ts';
import { useDrawing } from './context.tsx';

type Served = {
  readonly actor: AnyActor;
  readonly view: ViewOf<any>;
  readonly pending?: (props: Record<string, unknown>) => ReactNode;
  readonly failed?: (
    props: Record<string, unknown>,
    failure: Failure,
  ) => ReactNode;
};
type Page =
  | Served
  | ((props: Record<string, unknown>, input: unknown) => ReactNode);
type Handed = {
  readonly page?: Value;
  readonly inputs?: Inputs;
};

const isServed = (page: Page): page is Served =>
  typeof page === 'object' && 'actor' in page;

/** The code of a lazy View, loaded before it is first drawn. */
type Preload = () => Promise<void>;

/** The lazy View serving each place, by its node: written by the outlets, read by the Router. */
const lazyViews = new WeakMap<AnyNode, Preload>();

/** The nodes of the places on `route`, from the root down, each with its dotted name. */
const nodesOn = (children: Children, route: Value) => {
  const nodes: Array<readonly [string, AnyNode]> = [];
  let layer = children;
  let value: Value | undefined = route;
  const at: Array<string> = [];
  while (value) {
    const node: AnyNode | undefined = layer[value._tag];
    if (!node) break;
    at.push(value._tag);
    nodes.push([at.join('.'), node]);
    layer = node.children;
    value = value.page as Value | undefined;
  }
  return nodes;
};

/**
 * Start loading the code of every lazy View serving a place on `route`,
 * so it loads beside the place's Input rather than after it. A View whose
 * code fails to load is loaded again when it is drawn.
 */
export const preloadViews = (children: Children, route: Value) => {
  for (const [, node] of nodesOn(children, route))
    lazyViews
      .get(node)?.()
      .catch(() => {});
};

/** The screens each place's page has, by node: written by the outlets, read by the Router. */
const pageScreens = new WeakMap<
  AnyNode,
  { readonly pending: boolean; readonly failed: boolean }
>();

/**
 * Which screens the page of the place `name` on `route` has of its own: a
 * move to it lands early only for a pending screen, and lands broken only
 * for a failed screen, its own or the app's.
 */
export const screensOn = (children: Children, route: Value, name: string) => {
  const found = nodesOn(children, route).find(([dotted]) => dotted === name);
  return (
    (found && pageScreens.get(found[1])) ?? { pending: false, failed: false }
  );
};

/** The node a child tag names, the root's not-found included. */
const childOf = (node: AnyNode, tag: string): AnyNode =>
  node.children[tag] ?? {
    path: '',
    params: {},
    query: {},
    input: undefined,
    render: undefined,
    metadata: undefined,
    children: {},
  };

/**
 * What the child `tag` is handed, if it is current: its value's fields as
 * Props, with the Inputs of the places below it, and its own Input.
 * `missing` if its place has an Input and it is not there yet: its page is
 * not drawn until it is.
 */
const handedTo = (
  node: AnyNode,
  at: ReadonlyArray<string>,
  tag: string,
  props: Handed,
) => {
  const value = props.page;
  if (value?._tag !== tag) return undefined;
  const child = childOf(node, tag);
  const here = [...at, tag];
  const input = props.inputs?.[here.join('.')];
  const below = inputsUnder(props.inputs, here);
  return {
    key: paramsKey(child, value),
    props: { ...propsOf(value), ...(below ? { inputs: below } : {}) },
    input,
    missing: child.input !== undefined && input === undefined,
  };
};

const never = () => () => {};

/**
 * Whether this drawing is the browser's own: `false` on a server and while
 * hydrating what it drew, so a client place is drawn by the browser alone.
 */
const useBrowser = () =>
  useSyncExternalStore(
    never,
    () => true,
    () => false,
  );

/**
 * A node's outlet, at `at` in the tree: a keyed Child slot per child Route
 * an Actor serves, filled from the Props' `page` with at most one Instance;
 * the key is the child's params, so new params are a fresh Instance and a
 * new query is not. Each Instance starts from its place's Input, from the
 * Props' `inputs`, and is not there until that Input is. Its View draws the
 * Instance there, or the drawing that serves the child; a client place only
 * once the browser draws on its own, so a server draws its outlet empty.
 * While the current child has no Input, it draws the page's pending screen,
 * or its failed screen if the move to it broke, the app's if it has none.
 */
export const outletOf =
  (node: AnyNode, at: ReadonlyArray<string>) =>
  (pages: Readonly<Record<string, Page>>) => {
    const tags = Object.keys(pages);
    const served = tags.filter((tag) => isServed(pages[tag]!));

    const children = Object.fromEntries(
      served.map((tag) => [tag, Actor.many((pages[tag] as Served).actor)]),
    );
    for (const tag of served) {
      const page = pages[tag] as Served;
      const { preload } = page.view as { preload?: Preload };
      if (typeof preload === 'function')
        lazyViews.set(childOf(node, tag), preload);
      pageScreens.set(childOf(node, tag), {
        pending: page.pending !== undefined,
        failed: page.failed !== undefined,
      });
    }

    const invoke = ({ props }: { readonly props: Handed }) =>
      Object.fromEntries(
        served.map((tag) => {
          const handed = handedTo(node, at, tag, props);
          return [tag, handed && !handed.missing ? [handed] : []];
        }),
      );

    const View = ({
      of,
      children: wrap,
    }: {
      readonly of: {
        readonly props: Handed;
        readonly children: object;
      };
      readonly children?: (page: Drawn | null, move: Move<Value>) => ReactNode;
    }) => {
      const { move, failed, failedScreen } = useDrawing('An outlet');
      const browser = useBrowser();
      let page: Drawn | null = null;
      for (const tag of tags) {
        const serving = pages[tag]!;
        const handed = handedTo(node, at, tag, of.props);
        if (handed?.missing) {
          // A server draws the same pending screen the browser starts from.
          // A page drawn by a function has none, and the app's failed screen.
          const own = isServed(serving) ? serving : undefined;
          const screen = failed
            ? (own?.failed ?? (failedScreen && (() => failedScreen(failed))))
            : own?.pending;
          const showing = failed ? 'failed' : 'pending';
          if (screen)
            page = {
              key: `${tag}:${handed.key}:${showing}`,
              tag,
              showing,
              element: screen(handed.props, failed!),
            };
          break;
        }
        // A client place is drawn in the browser alone: never on a server.
        if (!browser && childOf(node, tag).render === 'client') continue;
        if (isServed(serving)) {
          const [instance] =
            ((of.children as Record<string, unknown>)[tag] as
              | ReadonlyArray<{ readonly id: string }>
              | undefined) ?? [];
          if (!instance) continue;
          const PageView = serving.view;
          page = {
            key: instance.id,
            tag,
            showing: 'page',
            element: <PageView instance={instance} />,
          };
          break;
        }
        if (handed && !handed.missing) {
          page = {
            key: `${tag}:${handed.key}`,
            tag,
            showing: 'page',
            element: serving(handed.props, handed.input),
          };
          break;
        }
      }
      // Keyed, so a new page, or a new Instance of one, starts its React state afresh.
      if (!wrap)
        return page ? <Fragment key={page.key}>{page.element}</Fragment> : null;
      return wrap(page, {
        from: valueAt(move.from as Value | null, at) ?? null,
        to: valueAt(move.to as Value, at) ?? null,
        how: move.how,
      });
    };

    return { children, invoke, View };
  };
