import { Otlp } from "@effect/opentelemetry";
import { FetchHttpClient } from "@effect/platform";
import { Layer } from "effect";

export const TelemetryLayer = Otlp.layerJson({
  baseUrl: "http://localhost:4318",
  resource: {
    serviceName: "whatever-code",
  },
}).pipe(Layer.provide(FetchHttpClient.layer));
