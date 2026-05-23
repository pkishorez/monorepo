import { Schema } from 'effect';

export class TerminalCommand extends Schema.Class<TerminalCommand>(
  'TerminalCommand',
)({
  cmd: Schema.String,
  args: Schema.optionalWith(Schema.Array(Schema.String), { as: 'Option' }),
}) {}

export class CreateTerminalRequest extends Schema.Class<CreateTerminalRequest>(
  'CreateTerminalRequest',
)({
  command: Schema.optionalWith(TerminalCommand, { as: 'Option' }),
  cwd: Schema.String,
  env: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.String }),
    {
      as: 'Option',
    },
  ),
  cols: Schema.Number,
  rows: Schema.Number,
  scrollback: Schema.optionalWith(Schema.Number, { default: () => 1000 }),
}) {}

export class TerminalInfo extends Schema.Class<TerminalInfo>('TerminalInfo')({
  id: Schema.Number,
  command: Schema.optionalWith(TerminalCommand, { as: 'Option' }),
  cwd: Schema.String,
  cols: Schema.Number,
  rows: Schema.Number,
  status: Schema.Literal('running', 'exited'),
  exitCode: Schema.optionalWith(Schema.Number, { as: 'Option' }),
}) {}

export class TerminalCreated extends Schema.Class<TerminalCreated>(
  'TerminalCreated',
)({
  id: Schema.Number,
}) {}

export class TerminalSnapshot extends Schema.Class<TerminalSnapshot>(
  'TerminalSnapshot',
)({
  data: Schema.String,
}) {}

export class TerminalIdRequest extends Schema.Class<TerminalIdRequest>(
  'TerminalIdRequest',
)({
  id: Schema.Number,
}) {}

export class WriteTerminalRequest extends Schema.Class<WriteTerminalRequest>(
  'WriteTerminalRequest',
)({
  id: Schema.Number,
  data: Schema.String,
}) {}

export class ResizeTerminalRequest extends Schema.Class<ResizeTerminalRequest>(
  'ResizeTerminalRequest',
)({
  id: Schema.Number,
  cols: Schema.Number,
  rows: Schema.Number,
}) {}

export class TerminalSpawnError extends Schema.TaggedError<TerminalSpawnError>()(
  'TerminalSpawnError',
  { message: Schema.String },
) {}

export class TerminalNotFoundError extends Schema.TaggedError<TerminalNotFoundError>()(
  'TerminalNotFoundError',
  { id: Schema.Number },
) {}
