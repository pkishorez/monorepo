import { useId, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Chips } from './chips.js';

export function Composer({
  chips = [],
  disabled,
  hint,
  placeholder,
  onAsk,
  onUnchip,
}: {
  readonly chips?: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly hint: string | null;
  readonly placeholder: string;
  readonly onAsk: (question: string) => void;
  readonly onUnchip?: (chip: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const empty = text.trim() === '' && chips.length === 0;
  const send = () => {
    if (disabled || empty) return;
    onAsk(text);
    setText('');
  };
  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-t border-border/50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {chips.length > 0 && <Chips chips={chips} onRemove={onUnchip} />}
      <div className="flex items-end gap-2 rounded-lg border border-input bg-background px-2.5 py-2 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 motion-reduce:transition-none dark:bg-input/30">
        <label htmlFor={id} className="sr-only">
          Question
        </label>
        <textarea
          id={id}
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            send();
          }}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <Button
          type="submit"
          size="icon-sm"
          aria-label="Ask"
          title="Ask (Enter)"
          disabled={disabled || empty}
        >
          <ArrowUpIcon aria-hidden className="size-4" />
        </Button>
      </div>
      {hint !== null && <p className="text-xs text-muted-foreground">{hint}</p>}
    </form>
  );
}
