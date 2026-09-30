import { ArrowUpIcon, ReplyIcon, XIcon } from '@kstackz/ui-toolkit/lucide';
import { AnimatePresence, motion } from 'motion/react';
import { type Ref, useState } from 'react';
import type { Quote } from './data.ts';

/**
 * Where you write: the message you are replying to, if any, over a field
 * that grows with its text. The field keeps its own touch, so selecting
 * and moving the caret work as usual. It sits above the floating pill.
 */
export function Composer(props: {
  readonly reply: Quote | undefined;
  readonly onCancelReply: () => void;
  readonly onSend: (text: string) => void;
  readonly inputRef: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState('');
  const ready = text.trim() !== '';

  const send = () => {
    if (!ready) return;
    props.onSend(text.trim());
    setText('');
  };

  return (
    <div className="shrink-0 border-t border-border bg-background/90 pr-[max(0.5rem,env(safe-area-inset-right))] pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+4rem)] pl-[max(0.5rem,env(safe-area-inset-left))] backdrop-blur">
      <AnimatePresence initial={false}>
        {props.reply === undefined ? null : (
          <motion.div
            key="reply"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', visualDuration: 0.2, bounce: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 px-2 pt-2">
              <ReplyIcon
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col border-l-2 border-primary pl-2 text-[13px]">
                <span className="font-medium text-primary">
                  {props.reply.author}
                </span>
                <span className="truncate text-muted-foreground">
                  {props.reply.text}
                </span>
              </div>
              <button
                type="button"
                aria-label="Cancel reply"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                onClick={props.onCancelReply}
              >
                <XIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <form
        className="flex items-end gap-2 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          ref={props.inputRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Message"
          aria-label="Message"
          className="field-sizing-content max-h-32 min-h-10 flex-1 resize-none rounded-[1.25rem] border border-input bg-background px-4 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!ready}
          // Keeps the field focused, and the keyboard up, as you send.
          onPointerDown={(event) => event.preventDefault()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity duration-150 disabled:opacity-40"
        >
          <ArrowUpIcon className="size-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
