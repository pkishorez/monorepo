import { Fragment, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from 'kui-toolkit/components/ui/tooltip';
import { Check, Copy } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import type {
  InjectedSegment,
  Segment,
  TimedWord,
  Transcript,
} from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';
import { ReadAloud } from '../read-aloud/index.ts';
import { transcriptToSpeech, transcriptToText } from './copy-text.ts';

export { transcriptToText };

type Token =
  | { readonly kind: 'word'; readonly key: string; readonly word: TimedWord }
  | {
      readonly kind: 'chip';
      readonly key: string;
      readonly segment: InjectedSegment<ContextPayload>;
    };

/**
 * One flat run of words and chips. A word is keyed by its position in the
 * session, so a later pass that revises it updates the same element in place
 * instead of mounting a new one, and only brand-new words fade in.
 */
const tokensOf = (
  segments: ReadonlyArray<Segment<ContextPayload>>,
): ReadonlyArray<Token> => {
  let position = 0;
  return segments.flatMap((segment): ReadonlyArray<Token> =>
    segment.kind === 'transcription'
      ? segment.words.map((word) => ({
          kind: 'word',
          key: `w${position++}`,
          word,
        }))
      : [{ kind: 'chip', key: segment.id, segment }],
  );
};

/**
 * Words only ever fade and change colour: nothing that moves or resizes them,
 * so the line never shifts while it settles.
 */
function Word({ word }: { readonly word: TimedWord }) {
  return (
    <span
      className={cn(
        'animate-word-in transition-colors duration-500 ease-out',
        word.final ? 'text-foreground' : 'text-muted-foreground/70',
      )}
    >
      {word.text}
    </span>
  );
}

/** A press. It glides to its new place when earlier words land before it. */
function Chip({
  segment,
}: {
  readonly segment: InjectedSegment<ContextPayload>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.span
            layout="position"
            transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            className={cn(
              // Same border in both states, so settling never changes the width.
              'animate-word-in mx-0.5 inline-flex cursor-default items-center rounded-md border px-1.5 align-baseline text-sm leading-6 font-medium transition-colors duration-500',
              segment.final
                ? 'border-transparent bg-primary/15 text-primary'
                : 'border-dashed border-primary/50 bg-transparent text-primary/80',
            )}
          />
        }
      >
        {segment.payload.label}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        <pre className="max-h-60 overflow-auto font-mono text-xs whitespace-pre-wrap">
          {segment.payload.text}
        </pre>
        <p className="mt-1 text-[10px] tabular-nums opacity-70">
          pressed at {segment.at.toFixed(2)} s
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy text'}
    </Button>
  );
}

/** The transcript as it settles: dim provisional words, chips for injections. */
export function TranscriptView({
  transcript,
  listening,
}: {
  readonly transcript: Transcript<ContextPayload>;
  readonly listening: boolean;
}) {
  const tokens = tokensOf(transcript.segments);
  const empty = tokens.length === 0;
  return (
    <TooltipProvider delay={150}>
      <section className="flex min-h-56 flex-col rounded-lg border bg-card">
        <header className="flex h-11 items-center justify-between gap-3 border-b px-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            Transcript
            {transcript.final ? (
              <span className="text-xs font-normal text-muted-foreground">
                final
              </span>
            ) : listening ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <span
                  aria-hidden
                  className="size-1.5 animate-pulse rounded-full bg-destructive"
                />
                listening
              </span>
            ) : null}
          </h2>
          {transcript.final && !empty ? (
            <div className="flex items-center gap-2">
              <ReadAloud text={transcriptToSpeech(transcript.segments)} />
              <CopyButton text={transcriptToText(transcript.segments)} />
            </div>
          ) : null}
        </header>
        <p
          aria-live="polite"
          className="flex-1 px-4 py-4 text-lg leading-8 text-pretty"
        >
          {empty ? (
            <span className="text-muted-foreground">
              {listening
                ? 'Say something. Words appear about a second behind you.'
                : 'Press Transcribe, speak, and press a context button mid-sentence.'}
            </span>
          ) : (
            tokens.map((token, index) => (
              <Fragment key={token.key}>
                {index > 0 ? ' ' : null}
                {token.kind === 'word' ? (
                  <Word word={token.word} />
                ) : (
                  <Chip segment={token.segment} />
                )}
              </Fragment>
            ))
          )}
          {listening && !empty ? (
            <span
              aria-hidden
              className="ml-1 inline-block h-5 w-0.5 translate-y-1 animate-pulse rounded-full bg-primary/60"
            />
          ) : null}
        </p>
      </section>
    </TooltipProvider>
  );
}
