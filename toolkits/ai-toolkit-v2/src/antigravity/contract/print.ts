export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly thinking_tokens: number;
  readonly cache_read_tokens: number;
  readonly total_tokens: number;
}

export interface Result {
  readonly conversation_id: string;
  readonly status: string;
  readonly response: string;
  readonly error?: string;
  readonly duration_seconds: number;
  readonly num_turns: number;
  readonly usage: Usage;
  readonly structured_output?: unknown;
  readonly json_schema?: unknown;
  readonly finished_reason?: string;
  readonly denied_actions?: ReadonlyArray<unknown>;
}

export interface PromptInput {
  readonly cwd: string;
  readonly prompt: string;
  readonly jsonSchema?: Readonly<Record<string, unknown>> | string;
  readonly model?: string;
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  readonly mode?: 'accept-edits' | 'auto' | 'plan';
  readonly settings?: Readonly<Record<string, unknown>> | string;
  readonly args?: ReadonlyArray<string>;
}
