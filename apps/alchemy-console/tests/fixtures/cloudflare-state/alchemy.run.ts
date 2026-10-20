import { Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

// A stack as Console deploys one: Cloudflare's providers and state.
export default Stack(
  'CloudflareFixture',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.succeed({}),
);
