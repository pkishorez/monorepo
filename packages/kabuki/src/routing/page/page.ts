import { Schema } from 'effect';
import { Actor } from '../../core/index.ts';
import type {
  ActorType,
  AnyActor,
  Behavior,
  KidsByState,
  OpenOfBehavior,
  Requires,
  Tagged,
  Types,
} from '../../core/index.ts';
import type { Navigation } from '../capability/index.ts';
import { levelSchema, paramsKey, pick } from '../route/index.ts';
import type {
  Children,
  Codec,
  Fields,
  LevelOf,
  MetadataOf,
  Node,
  RenderMode,
  ScrollMode,
  Simplify,
  Value,
} from '../route/index.ts';
import { placeOf, queryKey } from './place.ts';
import type {
  PlaceInput,
  PlaceMessage,
  PlaceModel,
  PlaceProps,
} from './place.ts';
import { statusSchema, whereSchema } from './status.ts';
import type { Carried, Status, Where } from './status.ts';

/*
 * A page: `Route.page({ path, params, data, pages, … })`, an Actor with a
 * place in the URL. It is written as any Actor is, with its own Model,
 * States, Messages, Children and Workers, and `build` takes how it behaves.
 * Kabuki adds the rest:
 *
 * 1. Props   its params and query, its data's `status`, and `route`.
 * 2. Pages   one Child per page under it, there while the URL names it and
 *            made again when its params change, beside the page's own.
 * 3. Place   the Actor around it that loads its data: what the page above,
 *            or the Router, holds as its Child.
 *
 * A page is a node of the Routes too: `Route.tree(App)` reads the tree of
 * them down from the root.
 */

type Single = { readonly _tag: 'Single' };

/** What `Route.page` takes: where the page is and what it loads, then the Actor's own Schemas. */
export interface PageOptions<
  P extends Fields,
  Q extends Fields,
  D,
  M extends RenderMode | undefined,
  C extends object,
  Model,
  State,
  Msg,
  R extends Requires,
> {
  /** Its path under the page above: `/projects/:id`. None, or `/`, adds nothing. */
  readonly path?: string;
  /** The Schema of each path param it names. */
  readonly params?: P;
  /** The Schema of each query field it reads; a change in one loads its data again. */
  readonly query?: Q;
  /** The Schema of what its Loader gives: it needs one, in `loaders.server.ts`. */
  readonly data?: Codec<D>;
  /** How it is first drawn: static, dynamic or client; its parent's unless said. */
  readonly render?: M;
  /** Where its Scroll areas go back to: `entry`, `url`, or `false`; its parent's unless said, `entry` at the root. */
  readonly scroll?: ScrollMode;
  /** What it says about itself, from its params, query and data once there. */
  readonly metadata?: MetadataOf<P, Q, D>;
  /** The pages under it, each named by its key here. */
  readonly pages?: C;
  /** The Capabilities its own Workers, Commands and Provides use. */
  readonly requires?: R;
  readonly model?: Codec<Model>;
  readonly state?: Codec<State>;
  readonly message?: Codec<Msg>;
}

/** What a page is handed as Props. */
export type PageProps<P extends Fields, Q extends Fields, D, C> = Simplify<
  {
    /** Its own path params. */
    readonly params: Schema.Struct.Type<P>;
    /** Its own query. */
    readonly query: Schema.Struct.Type<Q>;
    /** Where it sits; `route.page` is the Route one level down, if the URL goes on. */
    readonly route: Where<LevelOf<C>>;
  } & ([D] extends [never]
    ? {}
    : {
        /** Its data: loading, failed, or there. */
        readonly status: Status<D>;
      })
>;

/** The Place of a page, as a Child of the page above it. */
type PlaceKids<C> = {
  readonly [K in keyof C]: C[K] extends { readonly place: infer A }
    ? { readonly actor: A; readonly while: Function; readonly key: Function }
    : never;
};

/** What the Places of the pages under it still need from above. */
type PagesOpen<C> = {
  [K in keyof C]: C[K] extends { readonly place: infer A }
    ? Types<A>['open']
    : never;
}[keyof C];

/** A page's Actor: its own Children in each State, beside its pages. */
export type PageActor<
  P extends Fields,
  Q extends Fields,
  D,
  C extends object,
  Model,
  State extends Tagged,
  Msg extends Tagged,
  R extends Requires,
  B,
> = ActorType<
  'Page',
  void,
  PageProps<P, Q, D, C>,
  Model,
  State,
  Msg,
  {
    readonly [T in State['_tag']]: KidsByState<State, B>[T] & PlaceKids<C>;
  },
  OpenOfBehavior<R, B> | PagesOpen<C>
>;

/** The Place Kabuki writes around a page's Actor. */
export type PlaceActor<A extends AnyActor, D> = ActorType<
  'Place',
  PlaceInput,
  PlaceProps,
  PlaceModel<D>,
  Single,
  PlaceMessage<D>,
  { readonly Single: { readonly page: { readonly actor: A } } },
  Types<A>['open'] | Navigation
>;

/** A page: a node of the Routes, its Actor, and the Place around it. */
export interface Page<
  P extends Fields = any,
  Q extends Fields = any,
  C extends object = any,
  D = any,
  M extends RenderMode | undefined = any,
  A extends AnyActor = AnyActor,
  PA extends AnyActor = AnyActor,
> extends Node<P, Q, C, D, M> {
  /** The page's own Actor, which its View draws. */
  readonly actor: A;
  /** The Place around it, which the page above holds. */
  readonly place: PA;
}

export type AnyPage = Page<any, any, any, any, any, AnyActor, AnyActor>;

/** The pages under a page: each a page, by name. */
type Pages = { readonly [name: string]: AnyPage };

/** A page's Props, worked out from its Place's. */
const propsFor =
  (params: Fields, query: Fields) =>
  (props: PlaceProps, status: Status<unknown> | undefined) => ({
    params: pick(params, props.value),
    query: pick(query, props.value),
    route: {
      name: props.name,
      ...(props.value['page'] === undefined
        ? {}
        : { page: props.value['page'] }),
      params: props.params,
      notFound: props.notFound,
      ...(props.known === undefined ? {} : { known: props.known }),
      reload: props.reload,
    },
    ...(status === undefined ? {} : { status }),
  });

type Data = { readonly props: { readonly route: Carried } };

/** What the places below `name` start from: each level hands down only what is under it. */
const belowOf = (known: Carried['known'], name: string): Carried['known'] => {
  if (known === undefined) return undefined;
  const below = Object.entries(known).filter(([each]) =>
    each.startsWith(`${name}.`),
  );
  return below.length === 0 ? undefined : Object.fromEntries(below);
};

/** One Child per page under it: its Place, while the URL names it, again when its params change. */
const pagesOf = (pages: Pages) =>
  Object.fromEntries(
    Object.entries(pages).map(([tag, child]) => {
      const valueOf = ({ props }: Data) => props.route.page as Value;
      const nameOf = ({ props }: Data) =>
        props.route.name ? `${props.route.name}.${tag}` : tag;
      return [
        tag,
        {
          actor: child.place,
          while: (data: Data) => data.props.route.page?._tag === tag,
          key: (data: Data) => paramsKey(child, valueOf(data)),
          input: (data: Data): PlaceInput => {
            const known = data.props.route.known?.[nameOf(data)];
            return {
              ...(known === undefined ? {} : { known }),
              reload: data.props.route.reload,
              for: queryKey(child.query, valueOf(data)),
            };
          },
          props: (data: Data): PlaceProps => {
            const value = valueOf(data);
            const { route } = data.props;
            const below = belowOf(route.known, nameOf(data));
            return {
              name: nameOf(data),
              value,
              params: { ...route.params, ...pick(child.params, value) },
              notFound: null,
              ...(below === undefined ? {} : { known: below }),
              reload: route.reload,
            };
          },
        },
      ];
    }),
  );

/**
 * A page: where it is in the URL and what it loads, then its own Schemas;
 * `build` takes how it behaves, as `Actor.make(…).build` does.
 */
export const page = <
  const P extends Fields = {},
  const Q extends Fields = {},
  D = never,
  M extends RenderMode | undefined = undefined,
  const C extends Pages = {},
  Model = {},
  State extends Tagged = Single,
  Msg extends Tagged = never,
  const R extends Requires = readonly [],
>(
  options: PageOptions<P, Q, D, M, C, Model, State, Msg, R>,
) => ({
  build: <
    const B extends Behavior<
      void,
      PageProps<P, Q, D, C>,
      Model,
      State,
      Msg,
      R,
      B
    >,
  >(
    behavior?: B,
  ): Page<
    P,
    Q,
    C,
    D,
    M,
    PageActor<P, Q, D, C, Model, State, Msg, R, B>,
    PlaceActor<PageActor<P, Q, D, C, Model, State, Msg, R, B>, D>
  > => {
    const params = (options.params ?? {}) as Fields;
    const query = (options.query ?? {}) as Fields;
    const pages = (options.pages ?? {}) as Pages;
    const written = (behavior ?? {}) as {
      readonly children?: Record<string, unknown>;
      readonly state?: Record<string, { readonly children?: object }>;
    };
    const own = [
      ...Object.keys(written.children ?? {}),
      ...Object.values(written.state ?? {}).flatMap((block) =>
        Object.keys(block?.children ?? {}),
      ),
    ];
    for (const name of own)
      if (name in pages)
        throw new Error(
          `[@kestack/kabuki/routing] a page's Child "${name}" has the name of one of its pages`,
        );
    const props = Schema.Struct({
      params: Schema.Struct(params),
      query: Schema.Struct(query),
      route: whereSchema(
        Object.keys(pages).length > 0
          ? levelSchema(pages as Children, false)
          : undefined,
      ),
      ...(options.data ? { status: statusSchema(options.data) } : {}),
    });
    const actor = (
      Actor.make('Page', {
        props,
        ...(options.requires ? { requires: options.requires } : {}),
        ...(options.model ? { model: options.model } : {}),
        ...(options.state ? { state: options.state } : {}),
        ...(options.message ? { message: options.message } : {}),
      } as never) as unknown as { build: (behavior: unknown) => AnyActor }
    ).build({
      ...written,
      children: { ...written.children, ...pagesOf(pages) },
    });
    const place = placeOf(
      { params, query, data: options.data as Codec<unknown> | undefined },
      actor,
      propsFor(params, query),
    );
    return {
      path: options.path ?? '/',
      params,
      query,
      input: options.data,
      render: options.render,
      scroll: options.scroll,
      metadata: options.metadata,
      children: pages,
      actor,
      place,
    } as never;
  },
});
