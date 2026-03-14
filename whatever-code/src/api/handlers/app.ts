import { Effect, Stream } from "effect";
import { AppRpcs } from "../definitions/app.js";
import { BroadcastService } from "../../services/broadcast.js";

export const AppHandlers = AppRpcs.toLayer(
  AppRpcs.of({
    "app.subscribe": () =>
      Stream.unwrap(BroadcastService.pipe(Effect.map((v) => v.subscribe))),
  }),
);
