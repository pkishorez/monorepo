import { Effect, Option, Schema, SchemaGetter } from 'effect';

const asOption = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.Option(schema), {
      decode: SchemaGetter.transformOptional((o) => Option.some(o)),
      encode: SchemaGetter.transformOptional(Option.flatten),
    }),
  );

export class TerminalCommand extends Schema.Class<TerminalCommand>(
  'TerminalCommand',
)({
  cmd: Schema.String,
  args: asOption(Schema.Array(Schema.String)),
}) {}

export class CreateTerminalRequest extends Schema.Class<CreateTerminalRequest>(
  'CreateTerminalRequest',
)({
  command: asOption(TerminalCommand),
  cwd: Schema.String,
  env: asOption(Schema.Record(Schema.String, Schema.String)),
  cols: Schema.Number,
  rows: Schema.Number,
  scrollback: Schema.Number.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(1000)),
  ),
}) {}

export class TerminalInfo extends Schema.Class<TerminalInfo>('TerminalInfo')({
  id: Schema.Number,
  command: asOption(TerminalCommand),
  cwd: Schema.String,
  cols: Schema.Number,
  rows: Schema.Number,
  status: Schema.Literals(['running', 'exited']),
  exitCode: asOption(Schema.Number),
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

export class TerminalSpawnError extends Schema.TaggedErrorClass<TerminalSpawnError>()(
  'TerminalSpawnError',
  { message: Schema.String },
) {}

export class TerminalNotFoundError extends Schema.TaggedErrorClass<TerminalNotFoundError>()(
  'TerminalNotFoundError',
  { id: Schema.Number },
) {}
