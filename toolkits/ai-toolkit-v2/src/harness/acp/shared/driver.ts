import type {
  ClientApp,
  ClientConnection,
} from '@agentclientprotocol/sdk/unstable';
import { Context } from 'effect';
import type { Effect, Scope } from 'effect';
import type { AcpError } from '../contract/index.ts';

export class AcpDriver extends Context.Service<
  AcpDriver,
  {
    readonly connect: (
      app: ClientApp,
      cwd: string | undefined,
    ) => Effect.Effect<ClientConnection, AcpError, Scope.Scope>;
  }
>()('@kestack/ai-toolkit-v2/Acp/AcpDriver') {}
