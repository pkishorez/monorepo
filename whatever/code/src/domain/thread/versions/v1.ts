import { Schema } from 'effect';
import { id } from 'std-toolkit/eschema';

export const CodingHarnessV1 = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Codex'),
    sessionId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal('ClaudeCode'),
    sessionId: Schema.NullOr(Schema.String),
  }),
]);

export const GitContextV1 = Schema.Struct({
  githubUrl: Schema.NullOr(Schema.String),
  relativePath: Schema.String,
});

export const ThreadV1 = {
  machineId: id('MachineId'),
  workingDirectory: Schema.String,
  gitContext: Schema.NullOr(GitContextV1),
  harness: CodingHarnessV1,
};
