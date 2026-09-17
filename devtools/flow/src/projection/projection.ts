import { Schema } from 'effect';
import {
  ActivationOutcomeSchema,
  EntrySchema,
  type Entry,
  type Journal,
} from '../journal/index.js';

export const ProjectedActivationSchema = Schema.Struct({
  activationId: Schema.String,
  participantName: Schema.String,
  name: Schema.String,
  startItemId: Schema.String,
  endItemId: Schema.NullOr(Schema.String),
  startTimestamp: Schema.Number,
  endTimestamp: Schema.NullOr(Schema.Number),
  outcome: Schema.NullOr(ActivationOutcomeSchema),
});

export const ProjectedWaitSchema = Schema.Struct({
  participantName: Schema.String,
  name: Schema.String,
  startItemId: Schema.String,
  endItemId: Schema.NullOr(Schema.String),
  startTimestamp: Schema.Number,
  endTimestamp: Schema.NullOr(Schema.Number),
});

export const ProjectionWarningKindSchema = Schema.Literals([
  'activation-overlap',
  'activation-orphan-end',
  'reply-unknown',
  'resume-without-wait',
]);

export const ProjectionWarningSchema = Schema.Struct({
  itemId: Schema.String,
  kind: ProjectionWarningKindSchema,
  message: Schema.String,
});

export const FlowStatusSchema = Schema.Literals([
  'active',
  'failed',
  'quiet',
  'closed',
]);

/**
 * The view-shaped reading of one Journal. It is the one contract shared
 * between this package and any swim-lane renderer.
 */
export const ProjectionSchema = Schema.Struct({
  id: Schema.String,
  ordering: Schema.Literals(['recorded', 'clock']),
  latestTimestamp: Schema.Number,
  status: FlowStatusSchema,
  participants: Schema.Array(Schema.String),
  items: Schema.Array(EntrySchema),
  activations: Schema.Array(ProjectedActivationSchema),
  waits: Schema.Array(ProjectedWaitSchema),
  warnings: Schema.Array(ProjectionWarningSchema),
}).annotate({
  title: 'Flow Projection',
  description: 'Lanes, paired Activations, Waits, and Warnings of one Journal.',
});

export type ProjectedActivation = typeof ProjectedActivationSchema.Type;
export type ProjectedWait = typeof ProjectedWaitSchema.Type;
export type ProjectionWarningKind = typeof ProjectionWarningKindSchema.Type;
export type ProjectionWarning = typeof ProjectionWarningSchema.Type;
export type FlowStatus = typeof FlowStatusSchema.Type;
export type Projection = typeof ProjectionSchema.Type;
export type ProjectionItem = Entry;

interface OpenActivation {
  readonly activationId: string;
  readonly name: string;
  readonly startItemId: string;
  readonly startTimestamp: number;
}

interface OpenWait {
  readonly name: string;
  readonly startItemId: string;
  readonly startTimestamp: number;
}

/**
 * Derives the Projection of one Journal. Only four Warnings exist, each one an
 * authoring mistake: a second Activation Start while one is open, an
 * Activation End with no open Activation, a Reply to a Message the Journal
 * does not contain, and a Resume with no open Wait. An open Activation or an
 * unanswered Wait is a state, never a Warning.
 */
export const projectJournal = (journal: Journal): Projection => {
  const entryOrder = new Map(
    journal.entries.map((entry, index) => [entry.id, index]),
  );
  const warnings: ProjectionWarning[] = [];
  const activations: ProjectedActivation[] = [];
  const waits: ProjectedWait[] = [];
  const openActivations = new Map<string, OpenActivation>();
  const openWaits = new Map<string, OpenWait>();
  const participants = new Set<string>();
  const messageIds = new Set<string>();
  let latestTimestamp = 0;
  let closed = false;
  let failed = false;

  const closeActivation = (
    participantName: string,
    open: OpenActivation,
    end: Pick<ProjectedActivation, 'endItemId' | 'endTimestamp' | 'outcome'>,
  ) => {
    activations.push({ participantName, ...open, ...end });
    openActivations.delete(participantName);
  };

  const closeWait = (
    participantName: string,
    open: OpenWait,
    end: Pick<ProjectedWait, 'endItemId' | 'endTimestamp'>,
  ) => {
    waits.push({ participantName, ...open, ...end });
    openWaits.delete(participantName);
  };

  for (const item of journal.entries) {
    participants.add(item.participantName);
    latestTimestamp = Math.max(latestTimestamp, item.timestamp);

    switch (item.kind) {
      case 'message': {
        participants.add(item.destination);
        messageIds.add(item.messageId);
        if (item.replyTo !== undefined && !messageIds.has(item.replyTo)) {
          warnings.push({
            itemId: item.id,
            kind: 'reply-unknown',
            message: `Reply answers Message "${item.replyTo}", which this Journal does not contain.`,
          });
        }
        break;
      }
      case 'activation-start': {
        const previous = openActivations.get(item.participantName);
        if (previous) {
          warnings.push({
            itemId: item.id,
            kind: 'activation-overlap',
            message: `Activation started while "${previous.name}" was still open.`,
          });
          // The earlier Activation ends where the new one starts, with no Outcome.
          closeActivation(item.participantName, previous, {
            endItemId: item.id,
            endTimestamp: item.timestamp,
            outcome: null,
          });
        }
        openActivations.set(item.participantName, {
          activationId: item.activationId,
          name: item.name,
          startItemId: item.id,
          startTimestamp: item.timestamp,
        });
        break;
      }
      case 'activation-end': {
        const current = openActivations.get(item.participantName);
        if (!current) {
          warnings.push({
            itemId: item.id,
            kind: 'activation-orphan-end',
            message: 'Activation ended while none was open.',
          });
          break;
        }
        if (item.outcome === 'failed') failed = true;
        // The Activation End also ends any Wait still open on this lane.
        const wait = openWaits.get(item.participantName);
        if (wait) {
          closeWait(item.participantName, wait, {
            endItemId: item.id,
            endTimestamp: item.timestamp,
          });
        }
        closeActivation(item.participantName, current, {
          endItemId: item.id,
          endTimestamp: item.timestamp,
          outcome: item.outcome,
        });
        break;
      }
      case 'wait': {
        // A new Wait replaces the open one; the old one ends here.
        const previous = openWaits.get(item.participantName);
        if (previous) {
          closeWait(item.participantName, previous, {
            endItemId: item.id,
            endTimestamp: item.timestamp,
          });
        }
        openWaits.set(item.participantName, {
          name: item.name,
          startItemId: item.id,
          startTimestamp: item.timestamp,
        });
        break;
      }
      case 'resume': {
        const current = openWaits.get(item.participantName);
        if (!current) {
          warnings.push({
            itemId: item.id,
            kind: 'resume-without-wait',
            message: 'Resumed while no Wait was open.',
          });
          break;
        }
        closeWait(item.participantName, current, {
          endItemId: item.id,
          endTimestamp: item.timestamp,
        });
        break;
      }
      case 'check': {
        if (!item.passed) failed = true;
        break;
      }
      case 'close': {
        closed = true;
        break;
      }
      case 'event':
        break;
    }
  }

  for (const [participantName, open] of openActivations) {
    activations.push({
      participantName,
      ...open,
      endItemId: null,
      endTimestamp: null,
      outcome: null,
    });
  }
  for (const [participantName, open] of openWaits) {
    waits.push({
      participantName,
      ...open,
      endItemId: null,
      endTimestamp: null,
    });
  }

  activations.sort(
    (left, right) =>
      entryOrder.get(left.startItemId)! - entryOrder.get(right.startItemId)!,
  );
  waits.sort(
    (left, right) =>
      entryOrder.get(left.startItemId)! - entryOrder.get(right.startItemId)!,
  );

  const active = activations.some((activation) => activation.outcome === null);
  const status = failed
    ? 'failed'
    : closed
      ? 'closed'
      : active
        ? 'active'
        : 'quiet';

  return {
    id: journal.flowId,
    ordering: journal.ordering,
    latestTimestamp,
    status,
    participants: [...participants],
    items: journal.entries,
    activations,
    waits,
    warnings,
  };
};
