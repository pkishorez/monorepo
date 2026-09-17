import { ScanSearch, XIcon } from 'lucide-react';
import type { ProjectionWarningKind } from '@pkishorez/flow';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import { JsonTree } from '../../json';
import type { RecordedFlow } from '../flow-presentation';

type RecordedFlowItem = RecordedFlow['items'][number];

const kindLabels: Record<RecordedFlowItem['kind'], string> = {
  'activation-end': 'Activation ended',
  'activation-start': 'Activation started',
  check: 'Check',
  close: 'Flow closed',
  event: 'Event',
  message: 'Message',
  resume: 'Resumed',
  wait: 'Waiting',
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1) return `${Math.round(milliseconds * 1_000)} µs`;
  if (milliseconds < 1_000) return `${milliseconds.toFixed(0)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};

const lastSegment = (participantName: string) =>
  participantName.split('/').pop() ?? participantName;

/**
 * One plain sentence about what the Entry means, resolved against the rest of
 * the Flow when it points at another Entry.
 */
const describe = (
  item: RecordedFlowItem,
  flow: RecordedFlow | undefined,
): { readonly sentence: string; readonly failed: boolean } => {
  const who = lastSegment(item.participantName);
  switch (item.kind) {
    case 'event':
      return {
        sentence:
          item.severity === 'error'
            ? `${who} reported an error.`
            : item.severity === 'warning'
              ? `${who} raised a warning.`
              : `Something happened inside ${who}.`,
        failed: item.severity === 'error',
      };
    case 'message': {
      const answered =
        item.replyTo === undefined
          ? undefined
          : flow?.items.find(
              (other) =>
                other.kind === 'message' && other.messageId === item.replyTo,
            );
      if (item.replyTo !== undefined) {
        const latency =
          answered === undefined
            ? ''
            : ` after ${formatDuration(item.timestamp - answered.timestamp)}`;
        return {
          sentence: `${who} replied to ${lastSegment(item.destination)}${answered ? ` about "${answered.name}"` : ''}${latency}.`,
          failed: item.severity === 'error',
        };
      }
      return {
        sentence: `${who} sent this to ${lastSegment(item.destination)}.`,
        failed: false,
      };
    }
    case 'activation-start':
      return { sentence: `${who} became active.`, failed: false };
    case 'activation-end': {
      const activation = flow?.activations.find(
        (candidate) => candidate.activationId === item.activationId,
      );
      const name = activation ? `"${activation.name}"` : 'its activation';
      const took =
        activation && activation.endTimestamp !== null
          ? ` after ${formatDuration(activation.endTimestamp - activation.startTimestamp)}`
          : '';
      const verb =
        item.outcome === 'completed'
          ? 'completed'
          : item.outcome === 'failed'
            ? 'failed'
            : 'was interrupted';
      return {
        sentence: `${who}'s ${name} ${verb}${took}.`,
        failed: item.outcome === 'failed',
      };
    }
    case 'wait':
      return {
        sentence: `${who} paused itself: ${item.name}.`,
        failed: false,
      };
    case 'resume':
      return { sentence: `${who} continued on its own.`, failed: false };
    case 'check':
      return {
        sentence: item.passed
          ? `${who} confirmed "${item.name}".`
          : `${who} found that "${item.name}" did not hold.`,
        failed: !item.passed,
      };
    case 'close':
      return {
        sentence: `${who} considers this Flow finished.`,
        failed: false,
      };
  }
};

/** Why each warning happens and what the author should change. */
const warningGuide: Record<
  ProjectionWarningKind,
  { readonly why: string; readonly prevent: string }
> = {
  'activation-overlap': {
    why: 'A Participant can be alive in only one Activation at a time. The earlier one was still open when this one started, so the projector ended it here without an outcome.',
    prevent:
      'End the previous Activation before starting the next, or wrap the work in `activated(...)` so the end is written for you. If two things really run at once, give the second its own lane with a child Participant name such as `worker/retry`.',
  },
  'activation-orphan-end': {
    why: 'An Activation End arrived, but this Participant had no open Activation to end. Its start was never recorded, or it was already ended.',
    prevent:
      'Keep the `ActivationRef` returned by `activation.start` and call `end` on it exactly once, or use `activated(...)` which pairs start and end automatically.',
  },
  'reply-unknown': {
    why: 'This Reply answers a Message id that is not in the Journal. The Message was recorded in another Flow, was never recorded, or its Entries were lost.',
    prevent:
      'Reply with the `MessageToken` returned by `send` in the same Flow. When the token crosses a process, carry it in the payload and make sure both sides use the same Flow id.',
  },
  'resume-without-wait': {
    why: 'A Resume was recorded, but this Participant was not waiting. Its Wait was already resumed, replaced, or ended by the Activation End.',
    prevent:
      'Pair every `wait` with one `resume` on the same Participant, or use `waiting(...)` so the pair is written around the effect.',
  },
};

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function Row({
  label,
  children,
  title,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly title?: string;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate" title={title}>
        {children}
      </dd>
    </>
  );
}

/** Detail pane for one selected Entry: what it means, then its attributes. */
export function FlowItemDetails({
  item,
  flow,
  onClose,
  onOpenTrace,
  className,
}: {
  readonly item: RecordedFlowItem;
  /** The whole Flow, so replies and activation ends can name what they answer. */
  readonly flow?: RecordedFlow | undefined;
  readonly onClose?: () => void;
  /** Offered when the Entry carries a Trace Link the host can show. */
  readonly onOpenTrace?: (target: {
    readonly traceId: string;
    readonly spanId: string;
  }) => void;
  readonly className?: string;
}) {
  const attributes = item.attributes ?? {};
  const hasAttributes = Object.keys(attributes).length > 0;
  const traceLink =
    item.traceId !== undefined && item.spanId !== undefined
      ? { traceId: item.traceId, spanId: item.spanId }
      : null;
  const { sentence, failed } = describe(item, flow);
  const warningIndex =
    flow?.warnings.findIndex((warning) => warning.itemId === item.id) ?? -1;
  const warning = warningIndex === -1 ? null : flow!.warnings[warningIndex]!;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            failed
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {kindLabels[item.kind]}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={item.name}
        >
          {item.name}
        </span>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-8 px-6 py-6">
        <p
          className={cn(
            'text-sm leading-relaxed',
            failed ? 'text-destructive' : 'text-foreground',
          )}
        >
          {sentence}
        </p>

        {warning && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-destructive">
              <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                {warningIndex + 1}
              </span>
              Warning
            </p>
            <p className="text-sm leading-relaxed text-foreground">
              {warning.message}
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Why
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              {warningGuide[warning.kind].why}
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              How to prevent it
            </p>
            <p className="mt-1 text-sm leading-relaxed">
              {warningGuide[warning.kind].prevent}
            </p>
          </div>
        )}

        <div>
          <SectionLabel>Where and when</SectionLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <Row label="Participant" title={item.participantName}>
              <span className="font-mono">{item.participantName}</span>
            </Row>
            {item.kind === 'message' && (
              <Row label="To" title={item.destination}>
                <span className="font-mono">{item.destination}</span>
              </Row>
            )}
            <Row label="Time" title={new Date(item.timestamp).toISOString()}>
              <span className="font-mono tabular-nums">
                {formatTime(item.timestamp)}
              </span>
            </Row>
            {item.origin !== undefined && (
              <Row label="Recorded by" title={item.origin}>
                <span className="font-mono">{item.origin}</span>
              </Row>
            )}
            {item.severity !== 'info' && (
              <Row label="Severity">
                <span className="capitalize">{item.severity}</span>
              </Row>
            )}
          </dl>
          {traceLink && onOpenTrace && (
            <Button
              variant="outline"
              size="xs"
              className="mt-4"
              onClick={() => onOpenTrace(traceLink)}
            >
              <ScanSearch />
              Open the trace this ran in
            </Button>
          )}
        </div>

        {hasAttributes && (
          <div>
            <SectionLabel>Attributes</SectionLabel>
            <JsonTree value={attributes} />
          </div>
        )}
      </div>
    </div>
  );
}
