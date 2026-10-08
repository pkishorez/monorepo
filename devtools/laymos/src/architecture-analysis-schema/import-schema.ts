import { Schema } from 'effect';

import { ExceptionSchema } from './project-config-schema.js';

export const RuleSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
});

export type Rule = typeof RuleSchema.Type;

// What a Violation could become if the author wants the import: a Rule, an
// Exception, or nothing, because the import reaches a file that is no Index.
export const ViolationRemedySchema = Schema.Literals([
  'rule',
  'exception',
  'none',
]);

export type ViolationRemedy = typeof ViolationRemedySchema.Type;

export const ViolationReasonSchema = Schema.Literals([
  // No Rule covers the import between two Modules.
  'no-rule',
  // A Rule could not hold it: it would make a Rule loop.
  'against-rule',
  // A child importing its parent or an ancestor.
  'ancestor',
  // The imported file is not the target Module's Index.
  'not-index',
  // One side lies in no Module (a Wrapper coverage finding).
  'uncovered',
]);

export type ViolationReason = typeof ViolationReasonSchema.Type;

export const ImportVerdictSchema = Schema.Union([
  // A Module's own file importing the Index of a Module nested below it.
  Schema.Struct({ kind: Schema.Literal('nested') }),
  Schema.Struct({ kind: Schema.Literal('rule'), rule: RuleSchema }),
  Schema.Struct({
    kind: Schema.Literal('exception'),
    exception: ExceptionSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('violation'),
    reason: ViolationReasonSchema,
    remedy: ViolationRemedySchema,
  }),
]);

export type ImportVerdict = typeof ImportVerdictSchema.Type;

/**
 * One observed import between two different nodes of the Module tree, with
 * the law's verdict. Imports inside one Module are not listed.
 */
export const ModuleImportSchema = Schema.Struct({
  fromFile: Schema.String,
  fromModule: Schema.String,
  toFile: Schema.String,
  toModule: Schema.String,
  verdict: ImportVerdictSchema,
});

export type ModuleImport = typeof ModuleImportSchema.Type;

export const FindingSchema = Schema.Union([
  // An analyzed file in a plain Wrapper: no Module owns it.
  Schema.Struct({
    kind: Schema.Literal('wrapper-coverage'),
    file: Schema.String,
  }),
  // A declared Rule no import uses.
  Schema.Struct({ kind: Schema.Literal('unused-rule'), rule: RuleSchema }),
  // A declared Exception no import uses.
  Schema.Struct({
    kind: Schema.Literal('unused-exception'),
    exception: ExceptionSchema,
  }),
]);

export type Finding = typeof FindingSchema.Type;
