import { Schema } from 'effect';
import { Button } from '@kstackz/web-platform/components/button';

/*
 * One counter, as Foldkit's Submodel: a Message Schema, a pure step and a
 * drawing. It is not an Actor: it was written when an Actor's Children were
 * fixed per State and could not be a list (see ../notes.md). The parent
 * keeps each count in its Model and wraps these Messages with the row's id.
 */

export const CounterMessage = Schema.TaggedUnion({
  ClickedDecrement: {},
  ClickedIncrement: {},
});
type CounterMessage = typeof CounterMessage.Type;

/** The count after one Message. */
export const step = (count: number, message: CounterMessage) =>
  message._tag === 'ClickedIncrement' ? count + 1 : count - 1;

/** One counter's buttons and count; `send` reaches it through its parent. */
export const CounterRow = ({
  count,
  send,
}: {
  readonly count: number;
  readonly send: (message: CounterMessage) => void;
}) => (
  <div className="flex flex-1 items-center gap-3 rounded-lg border px-3 py-2">
    <Button
      size="icon-sm"
      variant="outline"
      aria-label="-"
      onClick={() => send({ _tag: 'ClickedDecrement' })}
    >
      −
    </Button>
    <span className="w-12 text-center font-mono text-2xl tabular-nums">
      {count}
    </span>
    <Button
      size="icon-sm"
      variant="outline"
      aria-label="+"
      onClick={() => send({ _tag: 'ClickedIncrement' })}
    >
      +
    </Button>
  </div>
);
