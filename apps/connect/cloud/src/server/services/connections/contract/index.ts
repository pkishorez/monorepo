import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import type {
  ConnectionRemoved,
  ConnectionTaken,
  Report,
} from '../../../rpc/heartbeat/contract/index.js';
import type { ConnectionNotFound } from '../../../rpc/app/contract/index.js';

export class Connections extends Context.Service<
  Connections,
  ConnectionsCalls
>()('ConnectCloud/server/Connections') {}

export type Choice = 'enabled' | 'disabled';
export type Choices = Readonly<Record<string, Choice>>;
export interface KeptConnection {
  readonly id: string;
  readonly name: string;
  readonly displayName: string | null;
  readonly version: string;
  readonly url: string | null;
  readonly key: string;
  readonly lastSeen: number;
  readonly choices: Choices;
}
export interface ConnectionsCalls {
  readonly report: (
    principal: Principal,
    report: Report,
  ) => Effect.Effect<Choices, ConnectionRemoved | ConnectionTaken>;
  readonly list: (
    principal: Principal,
  ) => Effect.Effect<ReadonlyArray<KeptConnection>>;
  readonly find: (
    principal: Principal,
    id: string,
  ) => Effect.Effect<KeptConnection, ConnectionNotFound>;
  readonly rename: (
    principal: Principal,
    id: string,
    displayName: string | null,
  ) => Effect.Effect<void, ConnectionNotFound>;
  readonly remove: (principal: Principal, id: string) => Effect.Effect<void>;
  readonly choose: (
    principal: Principal,
    id: string,
    plugin: string,
    choice: Choice,
  ) => Effect.Effect<void, ConnectionNotFound>;
}
