import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";

describe("play", () => {
  it("placeholder test", () => {
    expect(true).toBe(true);
  });

  it.effect("works with Effect", () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed("hello");
      expect(result).toBe("hello");
    }),
  );
});
