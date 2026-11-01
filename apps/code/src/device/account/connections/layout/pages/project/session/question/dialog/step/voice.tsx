import type { QuestionItem } from '@kestack/connect/code';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { CircleAlertIcon, MicIcon, SquareIcon } from 'lucide-react';
import { useEffect, useRef, type PointerEvent } from 'react';
import { useBound } from '../../../../../../commands.ts';
import type { Dictated, Owner } from '../../../../../../../voice/index.ts';
import { typable } from '../../answer.ts';

/*
 * One's own answer, dictated. Each Item that takes one, but a secret, is
 * its own field for the Dictation, by its question and Item: one started
 * there comes back there, wherever it is stopped, and its text goes after
 * what is typed, as typing would put it, choosing it. Every Item's is
 * taken as it comes (`Taking`), the step drawn or not, while the question
 * is. Its mic (`Mic`) starts and stops it, by a tap or Space on its row;
 * while one goes for another field it waits.
 */

/** Whether an Item's own answer can be dictated. */
export const dictates = (item: QuestionItem) => typable(item) && !item.secret;

/** The field an Item's own answer is, for the Dictation. */
export const ownerOf = (
  connectionId: string,
  questionId: string,
  item: QuestionItem,
): Owner | null =>
  dictates(item)
    ? { key: `question ${connectionId} ${questionId} ${item.id}`, connectionId }
    : null;

/** What is typed, then what was said, a space between. */
export const joined = (typed: string, said: string) =>
  typed.trim() === '' ? said : `${typed.trimEnd()} ${said}`;

/** Puts an Item's dictated text in once, as it comes, after what is typed. */
export function Taking({
  dictated,
  typed,
  held,
  onType,
}: {
  readonly dictated: Dictated;
  readonly typed: string;
  /** Being answered: nothing typed goes in, so the text waits until it is not. */
  readonly held: boolean;
  readonly onType: (text: string) => void;
}) {
  // Taken once, though its effect runs again before the Dictation hears.
  const took = useRef<number | null>(null);
  const latest = useRef({ typed, onType, onTook: dictated.onTook });
  latest.current = { typed, onType, onTook: dictated.onTook };
  const { pending } = dictated;
  const came = pending?._tag === 'Text' ? pending : null;
  useEffect(() => {
    if (came === null || held || took.current === came.id) return;
    took.current = came.id;
    const { typed, onType, onTook } = latest.current;
    onType(joined(typed, came.text));
    onTook(came.id);
  }, [came?.id, held]);
  return null;
}

/** Keeps focus where it is, as in the field being typed in. */
const keep = (event: PointerEvent) => event.preventDefault();

/**
 * The mic beside one's own answer: starts one for it, stops the one it
 * records, writes it out, offers a retry when refused; waits, and says
 * why, while voice can't be had or one goes for another field.
 */
export function Mic({
  dictated,
  touch,
}: {
  readonly dictated: Dictated;
  readonly touch: boolean;
}) {
  const dictateKeys = useBound('question.space');
  const { recording, pending, availability, onToggle, onRetry } = dictated;
  const size = touch ? 'size-11' : 'size-7';
  const plain = cn(size, 'shrink-0 rounded-full text-muted-foreground');
  if (recording !== null)
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {recording._tag === 'Recording' && (
          <span className="text-xs text-destructive">{recording.elapsed}</span>
        )}
        <Button
          type="button"
          variant={recording._tag === 'Waiting' ? 'secondary' : 'destructive'}
          size="icon-sm"
          aria-label={
            recording._tag === 'Waiting'
              ? 'Waiting for the microphone: cancel'
              : 'Stop the Dictation'
          }
          title="Stop the Dictation"
          onPointerDown={keep}
          onClick={onToggle}
          className={cn(size, 'shrink-0 rounded-full')}
        >
          {recording._tag === 'Waiting' ? (
            <Spinner />
          ) : (
            <SquareIcon aria-hidden className="fill-current" />
          )}
        </Button>
      </span>
    );
  if (pending?._tag === 'Transcribing')
    return (
      <span
        role="status"
        aria-label="Writing it out"
        title="Writing it out"
        className={cn(size, 'flex shrink-0 items-center justify-center')}
      >
        <Spinner />
      </span>
    );
  if (pending?._tag === 'Failed')
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Couldn’t transcribe: retry"
        title={`Couldn’t transcribe: ${pending.reason}. Retry`}
        onPointerDown={keep}
        onClick={() => onRetry(pending.id)}
        className={cn(plain, 'text-destructive')}
      >
        <CircleAlertIcon aria-hidden />
      </Button>
    );
  const why =
    availability._tag === 'Ready'
      ? null
      : availability._tag === 'Busy'
        ? 'Recording somewhere else'
        : availability._tag === 'Downloading'
          ? `Voice is getting ready · ${Math.round(availability.progress * 100)}%`
          : availability.reason;
  const label = why ?? 'Dictate your answer';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={
        why === null && dictateKeys !== null
          ? `${label} (${dictateKeys})`
          : label
      }
      disabled={why !== null}
      onPointerDown={keep}
      onClick={onToggle}
      className={plain}
    >
      <MicIcon aria-hidden />
    </Button>
  );
}
