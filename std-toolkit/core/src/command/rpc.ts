import { Rpc } from "@effect/rpc";
import {
  CommandPayloadSchema,
  CommandResponseSchema,
  CommandErrorSchema,
} from "./schema.js";

const COMMAND_RPC_PREFIX = "__std-toolkit__command" as const;

export const makeCommandRpc = <S extends string = "">(suffix?: S) => {
  const s = (suffix ?? "") as S;

  return Rpc.make(`${COMMAND_RPC_PREFIX}${s}` as `${typeof COMMAND_RPC_PREFIX}${S}`, {
    payload: CommandPayloadSchema,
    success: CommandResponseSchema,
    error: CommandErrorSchema,
  });
};

export type CommandRpc<S extends string = ""> = ReturnType<typeof makeCommandRpc<S>>;
