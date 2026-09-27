import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { compilePattern, isValidPattern } from './pattern.js';

export const StrategyName = Schema.Literals([
  'network-first',
  'cache-first',
  'stale-while-revalidate',
  'network-only',
  'cache-only',
]);
export type StrategyName = typeof StrategyName.Type;

/**
 * Which GET requests a rule applies to. Every present condition must hold.
 * `origin` is `'same-origin'` (the default) or an exact origin such as
 * `'https://fonts.gstatic.com'`; `pattern` is a regex source tested against
 * the full URL; `destination` lists `Request.destination` values.
 */
const RuntimeCacheMatch = Schema.Struct({
  origin: Schema.String.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed('same-origin')),
  ),
  pathPrefix: Schema.optionalKey(Schema.String.check(Schema.isStartsWith('/'))),
  pattern: Schema.optionalKey(
    Schema.String.check(
      Schema.makeFilter<string>((source) => isValidPattern(source), {
        expected: 'a valid RegExp source',
      }),
    ),
  ),
  destination: Schema.optionalKey(Schema.Array(Schema.String)),
});

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/**
 * One Runtime Cache rule. `cacheName` is the rule's own name (lowercase,
 * digits, dashes); the real cache is `runtimeCacheName(cacheName)`.
 * `networkTimeoutMs` applies to `network-first` only.
 */
export const StrategyRule = Schema.Struct({
  match: RuntimeCacheMatch,
  strategy: StrategyName,
  cacheName: Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)),
  networkTimeoutMs: Schema.optionalKey(PositiveInt),
  maxEntries: Schema.optionalKey(PositiveInt),
  maxAgeSeconds: Schema.optionalKey(PositiveInt),
});
export type StrategyRule = typeof StrategyRule.Type;

/** The parts of a `Request` rule matching reads; a real `Request` fits. */
export interface RequestLike {
  readonly url: string;
  readonly method: string;
  readonly destination: string;
}

/** Whether `rule` applies to `request`, seen from a worker at `selfOrigin`. */
export const matchStrategyRule = (
  rule: StrategyRule,
  request: RequestLike,
  selfOrigin: string,
): boolean => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  const { match } = rule;
  const origin = match.origin === 'same-origin' ? selfOrigin : match.origin;
  return (
    url.origin === origin &&
    (match.pathPrefix === undefined ||
      url.pathname.startsWith(match.pathPrefix)) &&
    (match.pattern === undefined ||
      compilePattern(match.pattern).test(url.href)) &&
    (match.destination === undefined ||
      match.destination.includes(request.destination))
  );
};

/** The first matching rule; rule order is priority. */
export const findStrategyRule = (
  rules: ReadonlyArray<StrategyRule>,
  request: RequestLike,
  selfOrigin: string,
): Option.Option<StrategyRule> =>
  Option.fromNullishOr(
    rules.find((rule) => matchStrategyRule(rule, request, selfOrigin)),
  );

/**
 * Whether a same-origin request's path starts with a `neverCache` prefix.
 * Such requests bypass every cache, including navigations.
 */
export const isNeverCached = (
  neverCache: ReadonlyArray<string>,
  request: Pick<RequestLike, 'url'>,
  selfOrigin: string,
): boolean => {
  const url = new URL(request.url);
  return (
    url.origin === selfOrigin &&
    neverCache.some((prefix) => url.pathname.startsWith(prefix))
  );
};
