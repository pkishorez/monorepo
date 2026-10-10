import { Effect, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Info } from 'lucide-react';

/*
 * A tooltip as an Actor: hidden, or shown. Hovering waits `delayMs` before
 * showing, as a Command; leaving replaces it, so a pointer that passes over
 * the trigger shows nothing. The wait runs in the app's Time: pausing the
 * timeline mid-wait holds the tooltip back too. Focus shows it at once, and
 * Escape, blur or leaving hide it.
 */

type Options = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly delayMs: number;
};

const make = (options: Options) => {
  const tip = `${options.id}-tip`;
  const hidden = { model: { shown: false }, cancel: 'wait' } as const;

  const Tooltip = Actor.make(`Tooltip(${options.id})`, {
    model: Schema.Struct({ shown: Schema.Boolean }),
    message: Schema.TaggedUnion({
      PointerEntered: {},
      Waited: {},
      Focused: {},
      Left: {},
    }),
  }).build({
    init: () => ({ model: { shown: false } }),
    update: {
      PointerEntered: (_, { model }) =>
        model.shown
          ? {}
          : options.delayMs === 0
            ? { model: { shown: true } }
            : {
                command: {
                  key: 'wait',
                  run: Effect.sleep(options.delayMs).pipe(
                    Effect.as({ _tag: 'Waited' as const }),
                  ),
                },
              },
      Waited: () => ({ model: { shown: true } }),
      Focused: () => ({ model: { shown: true } }),
      Left: () => hidden,
    },
  });

  const TooltipView = View.make(Tooltip, ({ model, send }) => (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={options.label}
        aria-describedby={model.shown ? tip : undefined}
        className="rounded-full p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onPointerEnter={() => send({ _tag: 'PointerEntered' })}
        onPointerLeave={() => send({ _tag: 'Left' })}
        onFocus={() => send({ _tag: 'Focused' })}
        onBlur={() => send({ _tag: 'Left' })}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && model.shown) send({ _tag: 'Left' });
        }}
      >
        <Info className="size-5" />
      </button>
      {model.shown && (
        <span
          id={tip}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background"
        >
          {options.text}
        </span>
      )}
    </span>
  ));

  return { Tooltip, TooltipView };
};

export { make as makeTooltip };
