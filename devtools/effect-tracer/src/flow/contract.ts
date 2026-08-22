export const flowAttributes = {
  activationOutcome: 'flow.activation.outcome',
  id: 'flow.id',
  itemType: 'flow.item.type',
  messageId: 'flow.message.id',
  messageReplyTo: 'flow.message.reply-to',
  messageTo: 'flow.message.to',
  participantName: 'flow.participant.name',
} as const;

/** Namespace for user-defined attributes attached directly to Flow logs. */
export const flowAttributePrefix = 'flowattr.' as const;

export const flowItemTypes = {
  activationEnd: 'activation-end',
  activationStart: 'activation-start',
  localEvent: 'local-event',
  message: 'message',
} as const;

export const activationOutcomeKinds = [
  'completed',
  'failed',
  'interrupted',
] as const;

export type ActivationOutcomeKind = (typeof activationOutcomeKinds)[number];

/** Why an Activation ended. `failed` cannot be constructed without a cause. */
export type ActivationOutcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'interrupted'; readonly reason?: string };

export const isActivationOutcomeKind = (
  value: unknown,
): value is ActivationOutcomeKind =>
  activationOutcomeKinds.some((kind) => kind === value);

/**
 * The flow-owned attributes one record carries, narrowed by its item type.
 * The wire form is a flat annotation record; this is the typed view over it.
 */
export type FlowRecordAttributes =
  | { readonly itemType: typeof flowItemTypes.localEvent }
  | {
      readonly itemType: typeof flowItemTypes.message;
      readonly messageId: string;
      readonly messageTo: string;
      readonly messageReplyTo?: string;
    }
  | { readonly itemType: typeof flowItemTypes.activationStart }
  | {
      readonly itemType: typeof flowItemTypes.activationEnd;
      readonly activationOutcome: ActivationOutcomeKind;
    };

/** Constructors for Activation Outcomes. `failed` requires its cause. */
export const Activation = {
  completed: (): ActivationOutcome => ({ kind: 'completed' }),
  failed: (error: unknown): ActivationOutcome => ({ error, kind: 'failed' }),
  interrupted: (reason?: string): ActivationOutcome => ({
    kind: 'interrupted',
    ...(reason === undefined ? {} : { reason }),
  }),
} as const;
