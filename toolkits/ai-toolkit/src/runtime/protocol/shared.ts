import { Schema } from 'effect';

export interface AgentQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly choices?: ReadonlyArray<string>;
}

export type Answer =
  | { readonly behavior: 'allow'; readonly updatedInput?: unknown }
  | { readonly behavior: 'deny'; readonly message?: string };

export const AnswerSchema = Schema.Union([
  Schema.Struct({
    behavior: Schema.Literal('allow'),
    updatedInput: Schema.optionalKey(Schema.Unknown),
  }),
  Schema.Struct({
    behavior: Schema.Literal('deny'),
    message: Schema.optionalKey(Schema.String),
  }),
]);

export interface NamedCustomPart<Name extends string, Data> {
  readonly type: 'custom';
  readonly name: Name;
  readonly data: Data;
}

export interface UserTurn {
  readonly id: string;
  readonly content: string;
}

export interface RunInput {
  readonly threadId: string;
  readonly runId: string;
  readonly message: UserTurn;
  readonly model: string;
}
