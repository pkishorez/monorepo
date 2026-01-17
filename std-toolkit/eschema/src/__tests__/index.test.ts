import { describe, it } from "@effect/vitest";
import * as v from "valibot";
import { ESchema } from "../eschema";

describe("eschema tests", () => {
  it("sample test", () => {
    const schema = ESchema.make(
      v.object({
        a: v.string(),
        b: v.optional(v.string(), "testing..."),
      }),
    )
      .evolve(
        "v2",
        v.object({
          a: v.string(),
          b: v.optional(v.string(), "testing..."),
          c: v.string(),
        }),
        (v) => ({ ...v, c: "hello world!" }),
      )
      .build();
    const value = schema.parse({ _v: "v1", a: "hello world!" });
    console.log(value);
  });
});
