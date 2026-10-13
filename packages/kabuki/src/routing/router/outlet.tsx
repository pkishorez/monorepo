import type { ReactNode } from 'react';
import { Actor } from '../../core/index.ts';
import type { AnyActor } from '../../core/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { paramsKey, propsOf, valueAt } from '../route/index.ts';
import type { AnyNode, Drawn, Move, Value } from '../route/index.ts';
import { useDrawing } from './context.tsx';

type Served = { readonly actor: AnyActor; readonly view: ViewOf<any> };
type Page = Served | ((props: Record<string, unknown>) => ReactNode);

const isServed = (page: Page): page is Served =>
  typeof page === 'object' && 'actor' in page;

/** The node a child tag names, the root's not-found included. */
const childOf = (node: AnyNode, tag: string): AnyNode =>
  node.children[tag] ?? {
    path: '',
    params: {},
    query: {},
    head: undefined,
    children: {},
  };

/**
 * A node's outlet, at `at` in the tree: a keyed Child slot per child Route
 * an Actor serves, filled from the Props' `page` with at most one Instance;
 * the key is the child's params, so new params are a fresh Instance and a
 * new query is not. Its View draws the Instance there, or the drawing that
 * serves the child.
 */
export const outletOf =
  (node: AnyNode, at: ReadonlyArray<string>) =>
  (pages: Readonly<Record<string, Page>>) => {
    const tags = Object.keys(pages);
    const served = tags.filter((tag) => isServed(pages[tag]!));

    const children = Object.fromEntries(
      served.map((tag) => [tag, Actor.many((pages[tag] as Served).actor)]),
    );

    const invoke = ({
      props,
    }: {
      readonly props: { readonly page?: Value };
    }) => {
      const value = props.page;
      return Object.fromEntries(
        served.map((tag) => [
          tag,
          value?._tag === tag
            ? [
                {
                  key: paramsKey(childOf(node, tag), value),
                  props: propsOf(value),
                },
              ]
            : [],
        ]),
      );
    };

    const View = ({
      of,
      children: wrap,
    }: {
      readonly of: {
        readonly props: { readonly page?: Value };
        readonly children: object;
      };
      readonly children?: (page: Drawn | null, move: Move<Value>) => ReactNode;
    }) => {
      const { move } = useDrawing('An outlet');
      const value = of.props.page;
      let page: Drawn | null = null;
      for (const tag of tags) {
        const serving = pages[tag]!;
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
            element: <PageView instance={instance} />,
          };
          break;
        }
        if (value?._tag === tag) {
          page = {
            key: `${tag}:${paramsKey(childOf(node, tag), value)}`,
            tag,
            element: serving(propsOf(value)),
          };
          break;
        }
      }
      if (!wrap) return page?.element ?? null;
      return wrap(page, {
        from: valueAt(move.from as Value | null, at) ?? null,
        to: valueAt(move.to as Value, at) ?? null,
        how: move.how,
      });
    };

    return { children, invoke, View };
  };
