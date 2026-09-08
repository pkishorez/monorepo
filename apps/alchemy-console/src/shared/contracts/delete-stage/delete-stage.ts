import { Schema } from 'effect';

const name = Schema.String.check(
  Schema.makeFilter((value) => value.length > 0 && value.length <= 512),
);
export const canDeleteStage = (stage: string) =>
  !stage.toLowerCase().startsWith('prod');
export const stageTarget = Schema.Struct({
  storeId: name,
  stack: name,
  stage: name,
});

export const deletionPlan = Schema.Struct({
  stack: Schema.String,
  stage: Schema.String,
  accountId: Schema.String,
  fingerprint: Schema.String,
  resources: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      type: Schema.String,
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

export const deletionEvent = Schema.Struct({
  kind: Schema.Literals(['progress', 'complete', 'failed', 'heartbeat']),
  id: Schema.NullOr(Schema.String),
  status: Schema.String,
  message: Schema.String,
});

export class DeleteStageError extends Schema.Error<DeleteStageError>(
  'alchemy-console/DeleteStageError',
)({
  _tag: Schema.tag('DeleteStageError'),
  code: Schema.Literals([
    'protected-stage',
    'view-only',
    'not-found',
    'storage-error',
    'remote-error',
    'invalid-response',
  ]),
  reason: Schema.String,
}) {}
