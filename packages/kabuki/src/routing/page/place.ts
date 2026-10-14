import { Effect, Option, Schema } from 'effect';
import { Actor } from '../../core/index.ts';
import type { AnyActor } from '../../core/index.ts';
import { Loading, Navigation, replace } from '../capability/index.ts';
import type { AnyRoute } from '../capability/index.ts';
import { pick } from '../route/index.ts';
import type { Codec, Fields, Value } from '../route/index.ts';
import { statusSchema } from './status.ts';
import type { Known, Status } from './status.ts';

/*
 * A Place: the Actor Kabuki writes around each Page. It holds the page's
 * data, loads it, and hands it to the page as `status`. A user never writes
 * one; `Route.page` makes it.
 *
 * 1. Start  from what is known as it is made: the data the Router loaded
 *           before the move landed, the server's, or a copy the Data cache
 *           kept, which it shows and loads again. Knowing nothing, Loading.
 * 2. Load   with its `load` Worker, while its data is loading, or due: after
 *           a reload, or when the query its Loader reads changes. The data
 *           shown stays meanwhile; a loading screen stays at least 300 ms.
 * 3. Hand   its one Child, the page, its params and query, its `status`,
 *           and `route`, Kabuki's part, which the page's own pages are made
 *           from. A new key, params, is a new Place, so a new page.
 */

/** How long a page's loading screen stays at least, so it never flashes. */
const MINIMUM = 300;

/** What a Place is told by the page above it, or the Router: its place, its value and what the places below start from. */
export interface PlaceProps {
  readonly name: string;
  /** Its own level of the Route: its params and query, and the level below under `page`. */
  readonly value: Value;
  /** Every path param down to it. */
  readonly params: Readonly<Record<string, unknown>>;
  readonly notFound: string | null;
  readonly known?: Readonly<Record<string, Known>>;
  readonly reload: number;
}

/** What a Place starts from. */
export interface PlaceInput {
  readonly known?: Known;
  /** How many times the app was reloaded as it is made. */
  readonly reload: number;
  /** The query its Loader reads, as one string, as it is made. */
  readonly for: string;
}

export interface PlaceModel<D> {
  readonly status: Status<D>;
  /** How many reloads its data has seen. */
  readonly reload: number;
  /** The query its data was loaded for. */
  readonly loadedFor: string;
}

export type PlaceMessage<D> =
  | {
      readonly _tag: 'Loaded';
      readonly data: D;
      readonly stale: boolean;
      readonly reload: number;
      readonly for: string;
    }
  | {
      readonly _tag: 'Failed';
      readonly reason: string;
      readonly notFound: boolean;
      readonly reload: number;
      readonly for: string;
    }
  | { readonly _tag: 'Redirected'; readonly route: AnyRoute };

const PropsSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.Record(Schema.String, Schema.Unknown),
  params: Schema.Record(Schema.String, Schema.Unknown),
  notFound: Schema.NullOr(Schema.String),
  known: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  reload: Schema.Number,
});

/** The query a place's Loader reads, of a value, as one string. */
export const queryKey = (query: Fields, value: Value | undefined) =>
  JSON.stringify(pick(query, value));

/** What a page is, to make its Place: its params, query and data's Schema. */
export interface PlaceSpec {
  readonly params: Fields;
  readonly query: Fields;
  readonly data: Codec<unknown> | undefined;
}

/** The Place around `page`: Props in, the page's Props out. */
export const placeOf = (
  spec: PlaceSpec,
  page: AnyActor,
  pageProps: (
    props: PlaceProps,
    status: Status<unknown> | undefined,
  ) => unknown,
): AnyActor => {
  // A page with no data is always Ready, with `null`: JSON keeps it.
  const data = spec.data ?? Schema.Null;
  const isData = Schema.is(Schema.toType(data));
  type Model = PlaceModel<unknown>;
  type Data = { readonly model: Model; readonly props: PlaceProps };
  const forOf = (props: PlaceProps) => queryKey(spec.query, props.value);

  // 2. Load
  /** What its `load` Worker runs for, as one key, if its data is due. */
  const due = ({ model, props }: Data): string | undefined => {
    if (!spec.data) return undefined;
    const asked =
      props.reload > model.reload || forOf(props) !== model.loadedFor;
    const { status } = model;
    if (
      status._tag === 'Loading' ||
      (status._tag === 'Ready' && status.refreshing) ||
      asked
    )
      // The status is in the key, so a copy that came while it loaded,
      // stale, is loaded again fresh: the Worker for a key it kept is not.
      return `${props.reload}:${forOf(props)}:${status._tag}`;
    return undefined;
  };
  /** Its status as the page sees it: data that is due is loading, behind the data shown if there is any. */
  const statusOf = (data: Data): Status<unknown> => {
    const { status } = data.model;
    if (due(data) === undefined) return status;
    return status._tag === 'Ready'
      ? { ...status, refreshing: true }
      : { _tag: 'Loading' };
  };

  const load = (self: {
    readonly send: (message: PlaceMessage<unknown>) => Effect.Effect<void>;
    readonly get: Effect.Effect<Data>;
    readonly now: Effect.Effect<number>;
  }) =>
    Effect.gen(function* () {
      const found = yield* Effect.serviceOption(Loading);
      if (Option.isNone(found)) return;
      const now = yield* self.get;
      const { model, props } = now;
      const shown = statusOf(now)._tag === 'Loading';
      const began = yield* self.now;
      const answers = yield* found.value.load(
        [
          {
            name: props.name,
            params: { ...props.params, ...pick(spec.query, props.value) },
          },
        ],
        // Data being loaded for a place that has none yet may already be
        // on its way, or kept: anything else is asked again.
        {
          fresh: model.status._tag !== 'Loading' || props.reload > model.reload,
        },
      );
      if (shown)
        yield* Effect.sleep(Math.max(0, began + MINIMUM - (yield* self.now)));
      const answer = answers[props.name] ?? {
        _tag: 'Broken',
        reason: `no answer for ${props.name}`,
      };
      const stamp = { reload: props.reload, for: forOf(props) };
      switch (answer._tag) {
        case 'Loaded':
          return yield* isData(answer.data)
            ? self.send({
                _tag: 'Loaded',
                data: answer.data,
                stale: answer.stale === true,
                ...stamp,
              })
            : self.send({
                _tag: 'Failed',
                reason: `the data of ${props.name} does not match its Schema`,
                notFound: false,
                ...stamp,
              });
        case 'NotFound':
          return yield* self.send({
            _tag: 'Failed',
            reason: 'Not found',
            notFound: true,
            ...stamp,
          });
        case 'Broken':
          return yield* self.send({
            _tag: 'Failed',
            reason: answer.reason,
            notFound: false,
            ...stamp,
          });
        case 'Redirect':
          return yield* self.send({
            _tag: 'Redirected',
            route: answer.route as AnyRoute,
          });
      }
    });

  return (
    Actor.make('Place', {
      requires: [Navigation],
      input: Schema.Struct({
        known: Schema.optionalKey(Schema.Unknown),
        reload: Schema.Number,
        for: Schema.String,
      }),
      props: PropsSchema,
      model: Schema.Struct({
        status: statusSchema(data),
        reload: Schema.Number,
        loadedFor: Schema.String,
      }),
      message: Schema.TaggedUnion({
        Loaded: {
          data,
          stale: Schema.Boolean,
          reload: Schema.Number,
          for: Schema.String,
        },
        Failed: {
          reason: Schema.String,
          notFound: Schema.Boolean,
          reload: Schema.Number,
          for: Schema.String,
        },
        Redirected: { route: Schema.Struct({ _tag: Schema.String }) },
      }),
    } as never) as unknown as { build: (behavior: unknown) => AnyActor }
  ).build({
    // 1. Start
    init: (input: PlaceInput): { model: Model } => {
      const { known } = input;
      const base = { reload: input.reload, loadedFor: input.for };
      if (!spec.data)
        return {
          model: {
            ...base,
            status: { _tag: 'Ready', data: null, refreshing: false },
          },
        };
      if (known?._tag === 'Ready')
        return {
          model: {
            ...base,
            status: {
              _tag: 'Ready',
              data: known.data,
              refreshing: known.stale,
            },
          },
        };
      if (known?._tag === 'Failed')
        return {
          model: {
            ...base,
            status: {
              _tag: 'Failed',
              reason: known.reason,
              notFound: known.notFound,
            },
          },
        };
      return { model: { ...base, status: { _tag: 'Loading' } } };
    },
    // 3. Hand
    children: {
      page: {
        actor: page,
        props: (data: Data) =>
          pageProps(data.props, spec.data ? statusOf(data) : undefined),
      },
    },
    on: {
      Loaded: (
        message: Extract<PlaceMessage<unknown>, { _tag: 'Loaded' }>,
      ) => ({
        model: {
          status: {
            _tag: 'Ready',
            data: message.data,
            refreshing: message.stale,
          },
          reload: message.reload,
          loadedFor: message.for,
        },
      }),
      // Loading again behind data shown, for the same query, keeps it.
      Failed: (
        message: Extract<PlaceMessage<unknown>, { _tag: 'Failed' }>,
        { model }: { readonly model: Model },
      ) => ({
        model:
          model.status._tag === 'Ready' && message.for === model.loadedFor
            ? {
                ...model,
                status: { ...model.status, refreshing: false },
                reload: message.reload,
              }
            : {
                status: {
                  _tag: 'Failed',
                  reason: message.reason,
                  notFound: message.notFound,
                },
                reload: message.reload,
                loadedFor: message.for,
              },
      }),
      Redirected: ({ route }: { readonly route: AnyRoute }) => ({
        command: replace(route),
      }),
    },
    workers: {
      load: {
        each: (data: Data) => {
          const key = due(data);
          return key === undefined ? [] : [key];
        },
        run: load,
      },
    },
  });
};
