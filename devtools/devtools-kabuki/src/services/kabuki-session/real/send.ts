import { Effect, Schema } from 'effect';
import type { Address } from '@kestack/kabuki';
import type { From } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import {
  InstanceNotFound,
  MessageRefused,
  Previewing,
} from '../../../server/rpc/session/contract/index.ts';
import type { SendAsked } from '../../../server/rpc/session/contract/index.ts';
import { blueprintAt, messagesOf } from './encode.ts';
import { instancesOf } from './played.ts';
import { runtimeOf } from './running.ts';

const FROM_DEVTOOLS: From = { kind: 'outside', name: 'devtools' };

const tagOf = (message: unknown): string | undefined => {
  if (typeof message !== 'object' || message === null) return undefined;
  const tag = (message as { readonly _tag?: unknown })._tag;
  return typeof tag === 'string' ? tag : undefined;
};

export const sendTo = (app: AppRuntime, { to, message }: SendAsked) =>
  Effect.gen(function* () {
    const runtime = yield* runtimeOf(app);
    if (app.seeking)
      return yield* new Previewing({ step: app.seeking.entry ?? 'start' });
    const instances = instancesOf(runtime.snapshot);
    const found = instances.find((one) => one.address === to);
    const live = found && runtime.at(found.address as Address);
    if (!found || !live)
      return yield* new InstanceNotFound({
        instance: to,
        at: app.history.head ?? 'start',
        available: instances.map((one) => one.address),
      });
    const tag = tagOf(message) ?? '';
    const schemas = messagesOf(blueprintAt(runtime.actor.blueprint, to));
    const schema = schemas.get(tag);
    if (!schema)
      return yield* new MessageRefused({
        to,
        tag,
        reason:
          tag === ''
            ? 'A Message is an object with a _tag'
            : `${found.actor} takes no Message ${tag}; it takes ${[...schemas.keys()].join(', ') || 'none'}`,
      });
    const decoded = yield* Schema.decodeUnknownEffect(
      schema as Schema.Codec<unknown, unknown>,
    )(message).pipe(
      Effect.mapError(
        (error) => new MessageRefused({ to, tag, reason: error.message }),
      ),
    );
    return live.send(decoded as never, FROM_DEVTOOLS);
  });
