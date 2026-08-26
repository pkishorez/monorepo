import { Data } from 'effect';

export class ESchemaError extends Data.TaggedError('ESchemaError')<{
  message: string;
  data?: unknown;
  cause?: unknown;
}> {}

export class UnrepresentableFieldError extends Error {
  constructor(
    readonly schema: string,
    readonly version: string,
    readonly path: string,
    readonly reason: 'transformation' | 'filter' | 'declaration',
  ) {
    super(
      `${schema} ${version}: field "${path}" uses a schema shape that cannot be captured and restored by a Snapshot (${reason}). Only structural fields (object, primitive, literal, union, array, enum, template literal, and branded values) are allowed.`,
    );
    this.name = 'UnrepresentableFieldError';
  }
}
