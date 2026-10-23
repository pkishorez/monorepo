import { useEffect, useState } from 'react';
import { Button } from '@kestack/web-platform/components/button';
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  MessageCircleQuestionIcon,
  XIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { MarkdownViewer } from '@kestack/web-platform/components/viewers/markdown-viewer';

/*
 * The answer to a `/btw` question, in a card over the Status Line's top edge:
 * the question, then a spinner while the session's context is asked, the
 * answer, or why it failed. It is never part of the transcript, and the
 * session goes on as it was. It is part of the page: the cross closes it,
 * and so does the page's Escape, which the session gives while it is
 * shown. The answer can be copied, and the button says so for a moment.
 */

const COPIED_MS = 1500;

export interface Asked {
  readonly question: string;
  readonly answer: string | null;
  readonly problem: string | null;
}

export function AskAnswer({
  asked,
  onDismiss,
}: {
  readonly asked: Asked;
  readonly onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const waiting = asked.answer === null && asked.problem === null;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section
      aria-label="Answer on the side"
      className="absolute inset-x-0 bottom-full z-10 mb-2 flex max-h-[min(24rem,55dvh)] origin-bottom flex-col rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-edge duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] animate-in fade-in-0 zoom-in-[0.98] slide-in-from-bottom-1 motion-reduce:animate-none dark:shadow-black/60"
    >
      <header className="flex items-start gap-2 border-b border-border py-2.5 pr-2 pl-3.5">
        <MessageCircleQuestionIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <p
          title={asked.question}
          className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground"
        >
          <span className="font-medium text-foreground">By the way: </span>
          {asked.question}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close the answer"
          title="Close (Esc)"
          className="shrink-0 text-muted-foreground"
          onClick={onDismiss}
        >
          <XIcon aria-hidden />
        </Button>
      </header>
      <div
        aria-live="polite"
        aria-busy={waiting}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 select-text"
      >
        {waiting ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5" />
            Asking the session, without interrupting it…
          </p>
        ) : asked.problem !== null ? (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>Could not get an answer. {asked.problem}</span>
          </p>
        ) : (
          <MarkdownViewer className="prose-sm leading-6 prose-p:my-1.5 prose-pre:my-2 text-sm">
            {asked.answer ?? ''}
          </MarkdownViewer>
        )}
      </div>
      {asked.answer !== null && (
        <footer className="flex items-center justify-between gap-2 border-t border-border py-1.5 pr-1.5 pl-3.5">
          <span className="text-xs text-muted-foreground">
            Not kept in the session
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => {
              void navigator.clipboard
                .writeText(asked.answer ?? '')
                .then(() => setCopied(true));
            }}
          >
            {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </footer>
      )}
    </section>
  );
}
