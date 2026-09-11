import { Schema } from 'effect';
import { providerKind } from '../credentials/index.ts';

const name = Schema.String.check(
  Schema.makeFilter((value) => value.length > 0 && value.length <= 512),
);
/** Stages whose names start with prod need an explicit acknowledgement before deletion. */
export const isProtectedStage = (stage: string) =>
  stage.toLowerCase().startsWith('prod');
export const protectedStageAcknowledgement = 'I KNOW WHAT I AM DOING';
export const acknowledgesProtectedStage = (
  stage: string,
  acknowledgement: string | undefined,
) =>
  !isProtectedStage(stage) || acknowledgement === protectedStageAcknowledgement;

/** A resource the user chose to stop tracking: its state row is dropped and nothing behind it is touched. */
export const forgottenResource = Schema.Struct({ id: name, type: name });
export const awsRegion = Schema.String.check(
  Schema.makeFilter((value) => /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(value)),
);
/** The user's pick of which credential (and, for AWS, which region) a provider uses during one deletion. */
export const credentialChoice = Schema.Struct({
  provider: providerKind,
  credentialId: Schema.NullOr(Schema.String),
  region: Schema.optional(Schema.NullOr(awsRegion)),
});
export const deletionOptions = Schema.Struct({
  forget: Schema.optional(Schema.Array(forgottenResource)),
  credentials: Schema.optional(Schema.Array(credentialChoice)),
});

/** Which credential a provider will use for this stage, with the alternatives the user may pick instead. */
export const credentialSelection = Schema.Struct({
  provider: providerKind,
  options: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      account: Schema.String,
    }),
  ),
  selected: Schema.NullOr(Schema.String),
  needsRegion: Schema.Boolean,
  region: Schema.NullOr(Schema.String),
  // Accounts and regions recorded on the stage's resources, so the user sees why a default was chosen.
  accounts: Schema.Array(Schema.String),
  regions: Schema.Array(Schema.String),
  resources: Schema.Number,
});

export const deletionPlan = Schema.Struct({
  stack: Schema.String,
  stage: Schema.String,
  fingerprint: Schema.String,
  executable: Schema.Boolean,
  credentials: Schema.Array(credentialSelection),
  resources: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      type: Schema.String,
      readiness: Schema.Literals([
        'ready',
        'unsupported',
        'missing-credentials',
        'blocked',
      ]),
      reason: Schema.NullOr(Schema.String),
      action: Schema.Literals(['delete', 'retain', 'forget']),
      after: Schema.Array(Schema.String),
      previous: Schema.Array(
        Schema.Struct({
          type: Schema.String,
          action: Schema.Literals(['delete', 'retain']),
        }),
      ),
    }),
  ),
});

export const analysisEvent = Schema.Struct({
  kind: Schema.Literals(['analyzing', 'analyzed']),
  id: Schema.String,
  type: Schema.String,
});

export const previewEvent = Schema.Union([
  analysisEvent,
  Schema.Struct({
    kind: Schema.Literal('failed'),
    id: Schema.NullOr(Schema.String),
    message: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('plan'), plan: deletionPlan }),
  Schema.Struct({ kind: Schema.Literal('heartbeat') }),
]);

export const deletionEvent = Schema.Struct({
  kind: Schema.Literals(['progress', 'complete', 'failed', 'heartbeat']),
  id: Schema.NullOr(Schema.String),
  status: Schema.String,
  message: Schema.String,
});

export class DeletionError extends Schema.Error<DeletionError>(
  'alchemy-console/DeletionError',
)({
  _tag: Schema.tag('DeletionError'),
  code: Schema.Literals([
    'managed-stack',
    'protected-stage',
    'not-found',
    'storage-error',
    'remote-error',
    'invalid-response',
  ]),
  reason: Schema.String,
}) {}
