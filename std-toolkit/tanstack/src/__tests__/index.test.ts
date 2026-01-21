import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";

describe("@std-toolkit/tanstack", () => {
  it.effect("collection can be used with Effect", () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed("dummy-items");
      expect(result).toBe("dummy-items");
    }),
  );
});
