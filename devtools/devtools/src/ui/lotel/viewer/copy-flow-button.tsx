import { useEffect, useRef, useState } from 'react';
import type { RecordedFlowSchema } from '@pkishorez/lotel/flow';
import { Button } from 'kui-toolkit/components/ui/button';
import { CheckIcon, CopyIcon, XIcon } from 'kui-toolkit/lucide';
import { makeFlowReport } from './flow-report';

type RecordedFlow = typeof RecordedFlowSchema.Type;
type CopyState = 'idle' | 'copied' | 'failed';

const feedbackDuration = 2_000;

/** Copies the whole Recorded Flow as a Markdown report to the clipboard. */
export function CopyFlowButton({ flow }: { flow: RecordedFlow }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const report = makeFlowReport(flow, { copiedAt: new Date() });
    let next: CopyState;
    try {
      await navigator.clipboard.writeText(report);
      next = 'copied';
    } catch {
      next = 'failed';
    }
    setState(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), feedbackDuration);
  };

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={() => void copy()}
      aria-label="Copy Flow as Markdown"
      title="Copy this Flow as a Markdown report to paste into a bug report or hand to an agent"
    >
      {state === 'copied' ? (
        <CheckIcon />
      ) : state === 'failed' ? (
        <XIcon />
      ) : (
        <CopyIcon />
      )}
      {state === 'copied'
        ? 'Copied'
        : state === 'failed'
          ? 'Copy failed'
          : 'Copy Flow'}
    </Button>
  );
}
