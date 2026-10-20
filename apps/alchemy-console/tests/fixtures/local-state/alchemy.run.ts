import { localState, Stack } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

// A stack that keeps its state on disk, which Console can't deploy.
export default Stack(
  'LocalFixture',
  { providers: Cloudflare.providers(), state: localState() },
  Effect.succeed({}),
);
