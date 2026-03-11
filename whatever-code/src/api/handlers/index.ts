import { Layer } from "effect";
import { HelloHandlers } from "./hello.js";

export { HelloHandlers };

export const ApiHandlers = Layer.mergeAll(HelloHandlers);
