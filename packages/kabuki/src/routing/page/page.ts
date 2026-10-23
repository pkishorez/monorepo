import { Schema } from 'effect';
import { Actor } from '../../core/index.ts';
import type {
  ActorType,
  AnyActor,
  Behavior,
  Defined,
  KidsByState,
  OpenOfBehavior,
  ProvidedOf,
  QueriesByState,
  Requires,
  Tagged,
  Types,
} from '../../core/index.ts';
import { Navigation } from '../capability/index.ts';
import { levelSchema, paramsKey, pick } from '../route/index.ts';
import type {
  Children,
  Codec,
  Fields,
  LevelOf,
  MetadataOf,
  Node,
  RenderMode,
  Simplify,
  Value,
} from '../route/index.ts';
import { statusSchema, whereSchema } from './status.ts';
import type { Carried, Status, Where } from './status.ts';

/*
 * A page: an Actor with a place in the URL, in the same two steps as any.
 *
 * 1. Define  `Page.define({ path, params, query, data, pages, … })`: where
 *            it is in the URL, what it loads, the pages under it, and the
 *            Actor's own Schemas. Its Props are worked out from them. A page
 *            definition is an Actor definition and a node of the Routes:
 *            `Router.define(App)` reads the tree of them down from the root.
 * 2. Build   `Page.build(Project, { pages, … })`: how it behaves, as
 *            `Actor.build` takes it, and the build of each page under it,
 *            each made a Child: there while the URL names it, made again
 *            when its params change, handed its params, query, `status` and
 *            `route`.
 *
 * Its data is not its own: the Router loads the data of every page on
 * screen and hands it down, each page its own `status`.
 */

type Single = { readonly _tag: 'Single' };

/** What `Page.define` takes: where the page is and what it loads, then the Actor's own Schemas. */
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
  /**
   * How long, in milliseconds, a copy of its data stays fresh once it
   * arrives: a Move or a Preload shows a fresh copy and loads nothing, and
   * an older one is shown and loaded again behind it. Its parent's unless
   * said, else the Router's. A static page has none: its data is fresh
   * until the next deploy.
   */
  readonly staleTime?: M extends 'static' ? never : number;
  /** What it says about itself, from its params, query and data once there. */
  readonly metadata?: MetadataOf<P, Q, D>;
  /** The definitions of the pages under it, each named by its key here. */
  readonly pages?: C;
  /** The Capabilities its own Workers, Commands and Provides use. `Navigation` is always among them. */
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

/** A page definition: a node of the Routes, and the definition of its Actor. */
export interface PageDefinition<
  P extends Fields = any,
  Q extends Fields = any,
  C extends object = any,
  D = any,
  M extends RenderMode | undefined = any,
  Model = any,
  State extends Tagged = any,
  Msg extends Tagged = any,
  R extends Requires = any,
>
  extends
    Node<P, Q, C, D, M>,
    Defined<
      'Page',
      void,
      PageProps<P, Q, D, C>,
      Model,
      State,
      Msg,
      readonly [...R, typeof Navigation]
    > {
  /** Its types, as written: read by the types alone, never there. */
  readonly '~page'?: {
    readonly params: P;
    readonly query: Q;
    readonly children: C;
    readonly data: [D];
    readonly model: Model;
    readonly state: State;
    readonly message: Msg;
    readonly requires: R;
  };
}

export type AnyPageDefinition = PageDefinition;

/** A built page: its Actor, the definition it was built from, and the builds of the pages under it. */
export type PageBuild<
  Def = AnyPageDefinition,
  A = AnyActor,
  Pages = any,
> = A & {
  /** The definition it was built from. */
  readonly page: Def;
  /** The build of each page under it, by name. */
  readonly pages: Pages;
};

export type AnyPageBuild = PageBuild<AnyPageDefinition, AnyActor, any>;

/** The build of each page under a definition: one per page it names, built from that page's definition. */
type PagesOf<C> = {
  readonly [K in keyof C]: PageBuild<C[K], AnyActor, any>;
};

/** What `Page.build` takes besides the Actor's behavior: the builds of the pages under it, if it has any. */
type WithPages<C> = [keyof C] extends [never]
  ? { readonly pages?: never }
  : { readonly pages: PagesOf<C> };

/** What the types of a page definition hold, as written. */
interface PageTypes {
  readonly params: Fields;
  readonly query: Fields;
  readonly children: object;
  readonly data: [unknown];
  readonly model: unknown;
  readonly state: Tagged;
  readonly message: Tagged;
  readonly requires: Requires;
}

type PropsOf<T extends PageTypes> = PageProps<
  T['params'],
  T['query'],
  T['data'][0],
  T['children']
>;

type RequiresOf<T extends PageTypes> = readonly [
  ...T['requires'],
  typeof Navigation,
];

/** How the page `D` defines may be built, as written in `B`. */
export type PageBehaviorOf<D, B> = D extends {
  readonly '~page'?: infer T extends PageTypes;
}
  ? Behavior<
      void,
      PropsOf<T>,
      T['model'],
      T['state'],
      T['message'],
      RequiresOf<T>,
      B
    > &
      WithPages<T['children']>
  : never;

/** Each page under it, as a Child of the page: there while the URL names it. */
type PageKids<Pages> = {
  readonly [K in keyof Pages]: {
    readonly actor: Pages[K];
    readonly while: Function;
    readonly key: Function;
  };
};

/** What the pages under it still need from above, before its own `provides`. */
type PagesOpen<Pages> = {
  [K in keyof Pages]: Types<Pages[K]>['open'];
}[keyof Pages];

type PagesIn<B> = B extends { readonly pages: infer Pages } ? Pages : {};

/** The page `D` defines, built with `B`. */
export type BuiltPage<D, B> = D extends {
  readonly '~page'?: infer T extends PageTypes;
}
  ? PageBuild<
      D,
      ActorType<
        'Page',
        void,
        PropsOf<T>,
        T['model'],
        T['state'],
        T['message'],
        {
          readonly [S in T['state']['_tag']]: (KidsByState<
            T['state'],
            B
          > extends infer K
            ? K[S & keyof K]
            : never) &
            PageKids<PagesIn<B>>;
        },
        | OpenOfBehavior<RequiresOf<T>, B>
        | Exclude<PagesOpen<PagesIn<B>>, ProvidedOf<B>>,
        QueriesByState<T['state'], B>
      >,
      PagesIn<B>
    >
  : never;

/** The root page is no place: a page with a path, params or data is refused. */
export type Rootless<G> = G extends {
  readonly '~page'?: {
    readonly params: infer P;
    readonly data: [infer D];
  };
}
  ? [D] extends [never]
    ? [keyof P] extends [never]
      ? unknown
      : { readonly 'the root page has no params': never }
    : { readonly 'the root page has no data': never }
  : unknown;

/**
 * A page definition: where it is in the URL, what it loads, the pages under
 * it, and its own Schemas. Its Props are worked out from them.
 */
const define = <
  const P extends Fields = {},
  const Q extends Fields = {},
  D = never,
  M extends RenderMode | undefined = undefined,
  const C extends { readonly [name: string]: AnyPageDefinition } = {},
  Model = {},
  State extends Tagged = Single,
  Msg extends Tagged = never,
  const R extends Requires = readonly [],
>(
  options: PageOptions<P, Q, D, M, C, Model, State, Msg, R>,
): PageDefinition<P, Q, C, D, M, Model, State, Msg, R> => {
  const params = (options.params ?? {}) as Fields;
  const query = (options.query ?? {}) as Fields;
  const pages = (options.pages ?? {}) as Children;
  const props = Schema.Struct({
    params: Schema.Struct(params),
    query: Schema.Struct(query),
    route: whereSchema(
      Object.keys(pages).length > 0 ? levelSchema(pages, false) : undefined,
    ),
    ...(options.data ? { status: statusSchema(options.data) } : {}),
  });
  return {
    name: 'Page',
    shape: {
      props,
      requires: [...(options.requires ?? []), Navigation],
      ...(options.model ? { model: options.model } : {}),
      ...(options.state ? { state: options.state } : {}),
      ...(options.message ? { message: options.message } : {}),
    },
    path: options.path ?? '/',
    params,
    query,
    input: options.data,
    render: options.render,
    staleTime: options.staleTime,
    metadata: options.metadata,
    children: pages,
  } as never;
};

type Data = { readonly props: { readonly route: Carried } };

/** What the places below `name` start from: each level hands down only the statuses under it. */
const belowOf = (
  data: Carried['data'],
  name: string,
): Carried['data'] | undefined => {
  if (data === undefined) return undefined;
  const below = Object.entries(data).filter(([each]) =>
    each.startsWith(`${name}.`),
  );
  return below.length === 0 ? undefined : Object.fromEntries(below);
};

/** Its Child for each page under it: there while the URL names it, made again when its params change. */
const pagesOf = (
  definitions: Children,
  builds: Readonly<Record<string, AnyPageBuild>>,
) =>
  Object.fromEntries(
    Object.entries(definitions).map(([tag, definition]) => {
      const build = builds[tag];
      if (!build)
        throw new Error(
          `[@kestack/kabuki/routing] the page "${tag}" has no build in \`pages\``,
        );
      if (build.page !== definition)
        throw new Error(
          `[@kestack/kabuki/routing] the build given for the page "${tag}" is built from another page's definition`,
        );
      // Named after its key, for devtools and errors.
      if (build.name === 'Page') {
        (build as { name: string }).name = tag;
        (build.definition as { name: string }).name = tag;
      }
      const valueOf = ({ props }: Data) => props.route.page as Value;
      const nameOf = ({ props }: Data) =>
        props.route.name ? `${props.route.name}.${tag}` : tag;
      return [
        tag,
        {
          actor: build,
          while: (data: Data) => data.props.route.page?._tag === tag,
          key: (data: Data) => paramsKey(definition, valueOf(data)),
          props: (data: Data) => {
            const value = valueOf(data);
            const { route } = data.props;
            const name = nameOf(data);
            const below = belowOf(route.data, name);
            return {
              params: pick(definition.params, value),
              query: pick(definition.query, value),
              route: {
                name,
                ...(value['page'] === undefined ? {} : { page: value['page'] }),
                params: { ...route.params, ...pick(definition.params, value) },
                notFound: null,
                ...(below === undefined ? {} : { data: below }),
              },
              ...(definition.input
                ? {
                    // The Router hands every page with data its status;
                    // before it does, the page's own render, its Stale
                    // time not known here.
                    status: route.data?.[name] ?? {
                      _tag: 'Loading',
                      info: {
                        render: definition.render ?? 'static',
                        staleTime: null,
                      },
                    },
                  }
                : {}),
            };
          },
        },
      ];
    }),
  );

function build<D extends AnyPageDefinition>(
  definition: D & ({} extends PageBehaviorOf<D, {}> ? unknown : never),
): BuiltPage<D, {}>;
function build<
  D extends AnyPageDefinition,
  const B extends PageBehaviorOf<D, B>,
>(definition: D, behavior: B): BuiltPage<D, B>;
/**
 * A page built: how it behaves, as `Actor.build` takes it, and under
 * `pages` the build of each page its definition names.
 */
function build(definition: AnyPageDefinition, behavior: any = {}): unknown {
  const { pages: builds = {}, ...written } = behavior as {
    readonly pages?: Readonly<Record<string, AnyPageBuild>>;
    readonly children?: Record<string, unknown>;
    readonly state?: Record<string, { readonly children?: object }>;
  };
  const pages = definition.children as Children;
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
  const actor = (
    Actor.build as (definition: unknown, behavior: unknown) => AnyActor
  )(definition, {
    ...written,
    children: { ...written.children, ...pagesOf(pages, builds) },
  });
  return Object.assign(actor, { page: definition, pages: builds });
}

/** Pages: `define` says what one is, `build` how it behaves. */
export const Page = { define, build };
