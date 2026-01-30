import { useEffect } from "react";
import { Effect } from "effect";
import { useComponentLifecycle } from "use-effect-ts";
import { RealtimeClient, runtime } from "../../../services";
import { useStudioStore } from "../store";
import type { DescriptorResponse } from "../types";

export function useDescriptors() {
  const { descriptors, setDescriptors } = useStudioStore();

  useComponentLifecycle(
    Effect.gen(function* () {
      const realtime = yield* RealtimeClient;
      const result = (yield* realtime.api["__std-toolkit__command"]({
        operation: "descriptor",
      })) as DescriptorResponse;

      console.log("Studio descriptors loaded:", result.descriptors);

      setDescriptors(result.descriptors);
    }).pipe(Effect.provide(runtime)),
  );

  return {
    descriptors,
    isLoading: descriptors.length === 0,
  };
}
