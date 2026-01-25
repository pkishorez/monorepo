export { ConnectionService } from "./connection";
export { handleMessage } from "./websocket";
export { typedWebSocket } from "./typed";

// For now we only support NdJson framing for ping/pong
export const pingConst = '{"_tag":"Ping"}\n';
export const pongConst = '{"_tag":"Pong"}\n';
