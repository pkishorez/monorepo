import { ClientEnd, FromServerEncoded } from "@effect/rpc/RpcMessage";

const serverMessageTags: Record<
  FromServerEncoded["_tag"] | ClientEnd["_tag"],
  true
> = {
  ClientEnd: true,
  Chunk: true,
  Exit: true,
  Defect: true,
  Pong: true,
  ClientProtocolError: true,
};

export const isRpcServerMessage = (
  message: unknown,
): message is FromServerEncoded =>
  typeof message === "object" &&
  message !== null &&
  "_tag" in message &&
  typeof message._tag === "string" &&
  message._tag in serverMessageTags;
