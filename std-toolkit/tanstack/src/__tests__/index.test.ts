import { describe, it, expect } from "@effect/vitest";
import { Effect } from "effect";
import { dummyCollection } from "../index";

describe("@std-toolkit/tanstack", () => {
  it("exports dummyCollection", () => {
    expect(dummyCollection).toBeDefined();
    expect(dummyCollection.id).toBe("dummy-items");
  });

  it.effect("collection can be used with Effect", () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(dummyCollection.id);
      expect(result).toBe("dummy-items");
    })
  );
});
