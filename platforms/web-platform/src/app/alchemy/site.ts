import type { InputProps } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { type Address, portlessPort, type Where, where } from './stage.ts';

/** The Workers runtime every site is built for, unless it says otherwise. */
const COMPATIBILITY = {
  date: '2025-07-04',
  flags: ['nodejs_compat'],
} as const;

export interface SiteOptions extends Address {
  /** The resource's id in the Stack. Default: `Site`. Changing it replaces the Worker. */
  readonly id?: string;
}

/**
 * A Kabuki Start app as a Cloudflare Website: one Worker in front of the
 * built assets, whose entry Start's Vite plugin gives it. On its own
 * domain on a deployed Stage, on Portless's port under `alchemy dev`.
 * What the app adds, such as `env`, `bindings` or another
 * `compatibility`, comes from `props`, given where the Stage serves.
 */
export const Site = <
  const Bindings extends Cloudflare.WorkerBindingProps = {},
  Req = never,
>(
  options: SiteOptions,
  props?: (
    at: Where,
  ) => Effect.Effect<
    InputProps<Cloudflare.Website.ViteProps<Bindings>>,
    never,
    Req
  >,
) =>
  Cloudflare.Website.Vite<
    Bindings,
    Req | Effect.Services<ReturnType<typeof where>>
  >(
    options.id ?? 'Site',
    Effect.gen(function* () {
      const at = yield* where(options);
      const own = props ? yield* props(at) : undefined;
      return {
        compatibility: COMPATIBILITY,
        dev: at.dev ? { port: portlessPort() } : undefined,
        domain: at.domain(),
        ...own,
      } as InputProps<Cloudflare.Website.ViteProps<Bindings>>;
    }),
  );
