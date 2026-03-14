import { Effect, Stream } from "effect";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { AppRpcs } from "../definitions/app.js";
import { BroadcastService } from "../../services/broadcast.js";
import { dataDir } from "../../db/index.js";

const openCommand = platform() === "darwin" ? "open" : platform() === "win32" ? "explorer" : "xdg-open";

export const AppHandlers = AppRpcs.toLayer(
  AppRpcs.of({
    "app.subscribe": () =>
      Stream.unwrap(BroadcastService.pipe(Effect.map((v) => v.subscribe))),
    "app.revealDataFolder": () =>
      Effect.sync(() => {
        spawn(openCommand, [dataDir], { detached: true, stdio: "ignore" }).unref();
      }),
  }),
);
