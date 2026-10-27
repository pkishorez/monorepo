import { useEffect, useState } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  MessageCircleQuestionIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { MarkdownViewer } from '@kestack/web-platform/ui/viewers/markdown-viewer';
import { useBound } from '../../../../../keys.ts';
import { notify } from '../../../../../ui/toast/index.ts';
import type { Asked } from '../actor.ts';

/*
 * Side Question mode, where the transcript was: "Back to session" at the
 * top, then the one question asked and how it stands: being answered, the
 * answer, or why it failed; before any, what the mode is for. The session
 * goes on as it was, and nothing here is kept: a new question replaces
 * this one and its answer. The answer can be copied, and the button says
 * so for a moment; refused, it says so quietly.
 */

const COPIED_MS = 1500;

export function SideQuestion({
  asked,
  onBack,
}: {
  readonly asked: typeof Asked.Type | null;
  readonly onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const backKeys = useBound('content.close');
  const waiting =
    asked !== null && asked.answer === null && asked.problem === null;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section
      aria-label="Side question"
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-6 pb-10 sm:px-6"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={backKeys === null ? undefined : `Back (${backKeys})`}
          onClick={onBack}
          className="-ml-2 text-muted-foreground pointer-coarse:h-11"
        >
          <ArrowLeftIcon aria-hidden />
          Back to session
        </Button>
        <span className="text-xs text-muted-foreground">
          Not kept in the session
        </span>
      </div>
      {asked === null ? (
        <div className="flex flex-col items-start gap-2 pt-6 text-sm text-muted-foreground">
          <MessageCircleQuestionIcon aria-hidden className="size-5" />
          <p className="text-base text-foreground">Ask on the side</p>
          <p className="max-w-prose">
            A question about this session, answered without interrupting it.
            Only the latest answer shows here, and nothing is kept.
          </p>
        </div>
      ) : (
        <>
          <p className="flex items-start gap-2 text-base">
            <MessageCircleQuestionIcon
              aria-hidden
              className="mt-1 size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 whitespace-pre-wrap select-text">
              {asked.question}
            </span>
          </p>
          <div aria-live="polite" aria-busy={waiting} className="select-text">
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
                <CircleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>Could not get an answer. {asked.problem}</span>
              </p>
            ) : (
              <MarkdownViewer className="prose-sm leading-6 prose-p:my-1.5 prose-pre:my-2 text-sm">
                {asked.answer ?? ''}
              </MarkdownViewer>
            )}
          </div>
          {asked.answer !== null && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="text-muted-foreground"
                onClick={() => {
                  void navigator.clipboard.writeText(asked.answer ?? '').then(
                    () => setCopied(true),
                    () =>
                      notify({
                        title: "Couldn't copy",
                        description:
                          'Allow Code to use the clipboard, then try again.',
                        seconds: 4,
                      }),
                  );
                }}
              >
                {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                {copied ? 'Copied' : 'Copy the answer'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
