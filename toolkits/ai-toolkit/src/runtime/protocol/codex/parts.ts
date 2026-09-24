import { Schema } from 'effect';
import type { NamedCustomPart } from '../shared.js';

export const CODEX_PARTS = {
  PLAN: 'codex.plan',
  COMMAND: 'codex.command',
  MCP: 'codex.mcp',
  REQUEST_RESOLVED: 'codex.request.resolved',
} as const;

export type CodexAnswer =
  | {
      readonly type: 'approval';
      readonly decision:
        | 'accept'
        | 'acceptForSession'
        | 'decline'
        | 'cancel'
        | {
            readonly acceptWithExecpolicyAmendment: {
              readonly execpolicy_amendment: ReadonlyArray<string>;
            };
          }
        | {
            readonly applyNetworkPolicyAmendment: {
              readonly network_policy_amendment: {
                readonly host: string;
                readonly action: 'allow' | 'deny';
              };
            };
          };
      readonly reason?: string;
    }
  | {
      readonly type: 'question';
      readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
    }
  | {
      readonly type: 'permissions';
      readonly permissions: {
        readonly network?: { readonly enabled: boolean | null };
        readonly fileSystem?: {
          readonly read: ReadonlyArray<string> | null;
          readonly write: ReadonlyArray<string> | null;
        };
      };
      readonly scope: 'turn' | 'session';
      readonly strictAutoReview?: boolean;
    }
  | {
      readonly type: 'elicitation';
      readonly action: 'accept' | 'decline' | 'cancel';
      readonly content: unknown;
      readonly metadata: unknown;
    };

export const CodexAnswerSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('approval'),
    decision: Schema.Union([
      Schema.Literals(['accept', 'acceptForSession', 'decline', 'cancel']),
      Schema.Struct({
        acceptWithExecpolicyAmendment: Schema.Struct({
          execpolicy_amendment: Schema.Array(Schema.String),
        }),
      }),
      Schema.Struct({
        applyNetworkPolicyAmendment: Schema.Struct({
          network_policy_amendment: Schema.Struct({
            host: Schema.String,
            action: Schema.Literals(['allow', 'deny']),
          }),
        }),
      }),
    ]),
    reason: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('question'),
    answers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal('permissions'),
    permissions: Schema.Struct({
      network: Schema.optionalKey(
        Schema.Struct({ enabled: Schema.NullOr(Schema.Boolean) }),
      ),
      fileSystem: Schema.optionalKey(
        Schema.Struct({
          read: Schema.NullOr(Schema.Array(Schema.String)),
          write: Schema.NullOr(Schema.Array(Schema.String)),
        }),
      ),
    }),
    scope: Schema.Literals(['turn', 'session']),
    strictAutoReview: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    type: Schema.Literal('elicitation'),
    action: Schema.Literals(['accept', 'decline', 'cancel']),
    content: Schema.Unknown,
    metadata: Schema.Unknown,
  }),
]);

export type CodexPart =
  | NamedCustomPart<typeof CODEX_PARTS.PLAN, { readonly text: string }>
  | NamedCustomPart<typeof CODEX_PARTS.COMMAND, { readonly event: unknown }>
  | NamedCustomPart<typeof CODEX_PARTS.MCP, { readonly event: unknown }>
  | NamedCustomPart<
      typeof CODEX_PARTS.REQUEST_RESOLVED,
      { readonly requestId: string; readonly answer: CodexAnswer }
    >;

const customPartSchema = <Name extends string, A, I, R>(
  name: Name,
  data: Schema.Codec<A, I, R>,
) =>
  Schema.Struct({
    type: Schema.Literal('custom'),
    name: Schema.Literal(name),
    data,
  });

export const CodexPartSchema = Schema.Union([
  customPartSchema(CODEX_PARTS.PLAN, Schema.Struct({ text: Schema.String })),
  customPartSchema(
    CODEX_PARTS.COMMAND,
    Schema.Struct({ event: Schema.Unknown }),
  ),
  customPartSchema(CODEX_PARTS.MCP, Schema.Struct({ event: Schema.Unknown })),
  customPartSchema(
    CODEX_PARTS.REQUEST_RESOLVED,
    Schema.Struct({ requestId: Schema.String, answer: CodexAnswerSchema }),
  ),
]);
