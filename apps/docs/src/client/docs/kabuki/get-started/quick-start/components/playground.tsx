import { Button } from '@kestack/web-platform/components/button';
import { CounterApp } from './counter-app.tsx';

/*
 * The counter, running, over its History: every Message it was sent, and a
 * slider that shows the counter as it was right after any of them. While a
 * past step is shown, the counter cannot be pressed; Live goes back. It
 * fills its Demo's height, and the list scrolls, so it never grows.
 */

export function Playground() {
  const { branch, shown, show } = CounterApp.useRuntime();
  // Step 0 is right after init; step n is right after the nth Message.
  const at =
    shown === null
      ? branch.length
      : shown === 'init'
        ? 0
        : branch.findIndex((entry) => entry.id === shown) + 1;
  const showStep = (step: number) =>
    show(
      step === branch.length
        ? null
        : step === 0
          ? 'init'
          : branch[step - 1]!.id,
    );
  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_8rem] sm:grid-cols-[minmax(0,1fr)_14rem] sm:grid-rows-1">
      <div className="flex flex-col items-center justify-center gap-8 p-8">
        <div
          className={shown === null ? '' : 'pointer-events-none opacity-60'}
          inert={shown !== null}
        >
          <CounterApp />
        </div>
        <div className="flex w-full max-w-sm items-center gap-3">
          <input
            type="range"
            aria-label="Step"
            min={0}
            max={branch.length}
            value={at}
            onChange={(event) => showStep(Number(event.target.value))}
            disabled={branch.length === 0}
            className="flex-1 accent-foreground"
          />
          <Button
            size="sm"
            variant={shown === null ? 'ghost' : 'default'}
            disabled={shown === null}
            onClick={() => show(null)}
          >
            Live
          </Button>
        </div>
      </div>
      <div
        data-messages
        className="min-h-0 overflow-y-auto border-t border-border bg-muted/30 p-3 font-mono text-xs sm:border-t-0 sm:border-l"
      >
        <p className="sticky -top-3 -mx-3 -mt-3 bg-muted px-5 py-2 text-muted-foreground">
          Messages
        </p>
        {branch.length === 0 ? (
          <p className="px-2 text-muted-foreground">Press + to send one.</p>
        ) : (
          <ol>
            {branch.map((entry, index) => (
              <li
                key={entry.id}
                // A new Message is kept in view, at the bottom of the list.
                ref={(item) => {
                  const list = item?.closest('[data-messages]');
                  if (list && shown === null)
                    list.scrollTop = list.scrollHeight;
                }}
              >
                <button
                  type="button"
                  onClick={() => showStep(index + 1)}
                  aria-current={at === index + 1 ? 'step' : undefined}
                  className="flex w-full gap-2 rounded px-2 py-1 text-left text-muted-foreground hover:bg-muted aria-[current=step]:bg-muted aria-[current=step]:text-foreground"
                >
                  <span className="w-5 text-right tabular-nums opacity-60">
                    {index + 1}
                  </span>
                  {entry.message._tag}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
