import { ManagedRuntime } from "effect";
import { RealtimeClient } from "./realtime-client";

export { RealtimeClient } from "./realtime-client";

export const runtime = ManagedRuntime.make(RealtimeClient.Default);
