import { Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Session } from '../../services/index.js';

const SESSION_SECONDS = 45;

/** A Request to the Node that Provides the Session: Auth signs out. */
const logOut = Effect.gen(function* () {
  (yield* Session).logOut();
});

/** Runs beside the todos while signed in, and signs out when time is up. */
export const Expiry = Node.make('Expiry', {
  requires: { session: Session },
  model: Schema.Struct({ secondsLeft: Schema.Number }),
  message: Schema.TaggedUnion({ Ticked: {}, Extended: {}, SignedOut: {} }),
}).build({
  init: () => ({ model: { secondsLeft: SESSION_SECONDS } }),
  lifetime: () =>
    Stream.tick('1 second').pipe(
      Stream.drop(1),
      Stream.as({ _tag: 'Ticked' as const }),
    ),
  update: {
    Ticked: (_, { model }) =>
      model.secondsLeft > 1
        ? { model: { secondsLeft: model.secondsLeft - 1 } }
        : { commands: [logOut] },
    Extended: () => ({ model: { secondsLeft: SESSION_SECONDS } }),
    SignedOut: () => ({ commands: [logOut] }),
  },
});

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const ExpiryView = View.make(Expiry, ({ model, send }) => {
  const soon = model.secondsLeft <= 10;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Session ends in{' '}
          <span
            className={`font-medium tabular-nums ${soon ? 'text-destructive' : 'text-foreground'}`}
          >
            {clock(model.secondsLeft)}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => send({ _tag: 'Extended' })}
          >
            Extend
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => send({ _tag: 'SignedOut' })}
          >
            Sign out
          </Button>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${soon ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${(model.secondsLeft / SESSION_SECONDS) * 100}%` }}
        />
      </div>
    </div>
  );
});
