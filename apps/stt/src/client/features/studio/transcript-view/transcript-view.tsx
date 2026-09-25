import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  Transcript,
  TranscriptionSegment,
} from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';
import { transcriptToText } from './copy-text.ts';

export { transcriptToText };

function Words({ segment }: { readonly segment: TranscriptionSegment }) {
  return (
    <>
      {segment.words.map((word, index) => (
        <motion.span
          key={`${word.start}-${index}`}
          className={cn(
            'transition-colors duration-300',
            word.final ? 'text-foreground' : 'text-muted-foreground',
          )}
          initial={{ opacity: 0, filter: 'blur(6px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        >
          {index > 0 ? ' ' : null}
          {word.text}
        </motion.span>
      ))}
    </>
  );
}

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
            initial={{ opacity: 0, y: -14, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.35 }}
            className={cn(
              'mx-0.5 inline-flex origin-bottom cursor-default items-center rounded-md px-1.5 py-0.5 align-baseline text-sm font-medium transition-colors duration-300',
              segment.final
                ? 'bg-primary/15 text-primary'
                : 'border border-dashed border-primary/50 text-primary/80',
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

function SegmentView({
  segment,
}: {
  readonly segment: Segment<ContextPayload>;
}) {
  return segment.kind === 'transcription' ? (
    <Words segment={segment} />
  ) : (
    <Chip segment={segment} />
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
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? 'copied' : 'copy'}
          className="inline-flex items-center gap-1.5"
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy text'}
        </motion.span>
      </AnimatePresence>
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
  const empty = transcript.segments.length === 0;
  return (
    <TooltipProvider delay={150}>
      <section className="flex min-h-56 flex-col rounded-lg border bg-card">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <h2 className="text-sm font-medium">
            Transcript
            {transcript.final ? (
              <span className="ml-2 text-xs text-muted-foreground">final</span>
            ) : listening ? (
              <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="size-1.5 animate-pulse rounded-full bg-destructive"
                />
                listening
              </span>
            ) : null}
          </h2>
          {transcript.final && !empty ? (
            <CopyButton text={transcriptToText(transcript.segments)} />
          ) : null}
        </header>
        <p
          aria-live="polite"
          className="flex-1 px-4 py-4 text-lg leading-8 text-pretty"
        >
          {empty ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={listening ? 'listening' : 'idle'}
                className="text-muted-foreground"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              >
                {listening
                  ? 'Say something. Words appear about a second behind you.'
                  : 'Press Transcribe, speak, and press a context button mid-sentence.'}
              </motion.span>
            </AnimatePresence>
          ) : (
            transcript.segments.map((segment, index) => (
              <span key={segment.kind === 'injected' ? segment.id : index}>
                {index > 0 ? ' ' : null}
                <SegmentView segment={segment} />
              </span>
            ))
          )}
        </p>
      </section>
    </TooltipProvider>
  );
}
