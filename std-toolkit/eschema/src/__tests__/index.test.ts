import { describe, it, expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ESchema, brandedString } from "../index";
import { ESchemaError } from "../utils";
import type { StandardSchemaV1 } from "@standard-schema/spec";

const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
  decode: (val) => parseInt(val),
  encode: (val) => String(val),
});

describe("ESchema.make", () => {
  it.effect("creates a v1 schema with name and branded id field", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("User", "id", {
        name: Schema.String,
      }).build();

      expect(schema.idField).toBe("id");
      const encoded = yield* schema.encode({
        id: schema.makeId("u1"),
        name: "Alice",
      });
      expect(encoded).toEqual({ _v: "v1", id: "u1", name: "Alice" });
    }),
  );

  it.effect("supports complex field types", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Complex", "id", {
        count: StringToNumber,
        optional: Schema.optionalWith(Schema.String, {
          default: () => "default",
        }),
        nullable: Schema.NullOr(Schema.String),
      }).build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "c1",
        count: "42",
        nullable: null,
      });

      expect(decoded).toEqual({
        id: schema.makeId("c1"),
        count: 42,
        optional: "default",
        nullable: null,
      });
    }),
  );

  it("supports custom id field names", () => {
    const schema = ESchema.make("User", "userId", {
      name: Schema.String,
    }).build();

    expect(schema.idField).toBe("userId");
  });

  it("makeId creates a branded ID", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const id = schema.makeId("u1");
    expect(id).toBe("u1");
    // Type check: id should be string & Brand<"UserId">
  });
});

describe("ESchema.schema getter", () => {
  it("returns the latest schema fields including id", () => {
    const schema = ESchema.make("Test", "id", {
      a: Schema.String,
    }).build();

    expect(Object.keys(schema.schema)).toEqual(["a", "id"]);
  });

  it("returns evolved schema fields after evolution", () => {
    const schema = ESchema.make("Test", "id", {
      a: Schema.String,
    })
      .evolve("v2", { b: Schema.Number }, (v) => ({
        ...v,
        b: 0,
      }))
      .build();

    expect(Object.keys(schema.schema).sort()).toEqual(["a", "b", "id"]);
  });
});

describe("ESchema.makePartial", () => {
  it("returns partial value with version", () => {
    const schema = ESchema.make("Test", "id", {
      a: Schema.String,
      b: Schema.Number,
    }).build();

    const partial = schema.makePartial({ a: "hello" });
    expect(partial).toEqual({ a: "hello", _v: "v1" });
  });

  it("allows empty partial", () => {
    const schema = ESchema.make("Test", "id", {
      a: Schema.String,
    }).build();

    const partial = schema.makePartial({});
    expect(partial).toEqual({ _v: "v1" });
  });
});

describe("ESchema.decode", () => {
  it.effect("decodes v1 data without migration", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "t1",
        name: "foo",
        count: "10",
      });
      expect(decoded).toEqual({
        id: schema.makeId("t1"),
        name: "foo",
        count: 10,
      });
    }),
  );

  it.effect("decodes and migrates v1 to v2", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: StringToNumber,
      })
        .evolve("v2", { b: Schema.String }, (v) => ({
          ...v,
          b: "added",
        }))
        .build();

      const decoded = yield* schema.decode({ _v: "v1", id: "t1", a: "42" });
      expect(decoded).toEqual({ id: schema.makeId("t1"), a: 42, b: "added" });
    }),
  );

  it.effect("decodes latest version without running migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: Schema.String,
      })
        .evolve("v2", { b: Schema.String }, (v) => ({
          ...v,
          b: "should not appear",
        }))
        .build();

      const decoded = yield* schema.decode({
        _v: "v2",
        id: "t1",
        a: "hello",
        b: "world",
      });
      expect(decoded).toEqual({
        id: schema.makeId("t1"),
        a: "hello",
        b: "world",
      });
    }),
  );

  it.effect("fails with ESchemaError on unknown version", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: Schema.String,
      }).build();

      const error = yield* Effect.flip(
        schema.decode({ _v: "v99", id: "t1", a: "hello" }),
      );
      expect(error).toBeInstanceOf(ESchemaError);
      expect(error.message).toBe("Unknown schema version: v99");
    }),
  );

  it.effect("defaults to latest version when _v is missing", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: Schema.String,
      }).build();

      const decoded = yield* schema.decode({ id: "t1", a: "hello" });
      expect(decoded).toEqual({ id: schema.makeId("t1"), a: "hello" });
    }),
  );
});

describe("ESchema.encode", () => {
  it.effect("encodes value with version metadata", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("User", "id", {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({
        id: schema.makeId("u1"),
        name: "Alice",
      });
      expect(encoded).toEqual({ _v: "v1", id: "u1", name: "Alice" });
    }),
  );

  it.effect("applies field transformations on encode", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        count: StringToNumber,
      }).build();

      const encoded = yield* schema.encode({
        id: schema.makeId("t1"),
        count: 42,
      });
      expect(encoded).toEqual({ _v: "v1", id: "t1", count: "42" });
    }),
  );

  it.effect("encodes with latest version after evolution", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: Schema.String,
      })
        .evolve("v2", { b: Schema.Number }, (v) => ({
          ...v,
          b: 0,
        }))
        .build();

      const encoded = yield* schema.encode({
        id: schema.makeId("t1"),
        a: "hello",
        b: 123,
      });
      expect(encoded).toEqual({ _v: "v2", id: "t1", a: "hello", b: 123 });
    }),
  );

  it.effect("strips _v from input before encoding", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        name: Schema.String,
      }).build();

      const encoded = yield* schema.encode({
        _v: "old",
        id: schema.makeId("t1"),
        name: "test",
      } as any);
      expect(encoded).toEqual({ _v: "v1", id: "t1", name: "test" });
    }),
  );
});

describe("ESchema.evolve (multiple evolutions)", () => {
  it.effect("chains v1 → v2 → v3 migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: Schema.String,
      })
        .evolve("v2", { b: Schema.String }, (v) => ({
          ...v,
          b: "from-v1",
        }))
        .evolve("v3", { c: Schema.Number }, (v) => ({
          ...v,
          c: 100,
        }))
        .build();

      const fromV1 = yield* schema.decode({ _v: "v1", id: "t1", a: "hello" });
      expect(fromV1).toEqual({
        id: schema.makeId("t1"),
        a: "hello",
        b: "from-v1",
        c: 100,
      });

      const fromV2 = yield* schema.decode({
        _v: "v2",
        id: "t1",
        a: "hello",
        b: "existing",
      });
      expect(fromV2).toEqual({
        id: schema.makeId("t1"),
        a: "hello",
        b: "existing",
        c: 100,
      });

      const fromV3 = yield* schema.decode({
        _v: "v3",
        id: "t1",
        a: "hello",
        b: "existing",
        c: 999,
      });
      expect(fromV3).toEqual({
        id: schema.makeId("t1"),
        a: "hello",
        b: "existing",
        c: 999,
      });
    }),
  );

  it.effect("handles field removal in migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        a: Schema.String,
        b: Schema.String,
      })
        .evolve("v2", { b: null }, (v) => ({
          id: v.id,
          a: v.a,
        }))
        .build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "t1",
        a: "keep",
        b: "drop",
      });
      expect(decoded).toEqual({ id: schema.makeId("t1"), a: "keep" });
    }),
  );

  it.effect("handles field transformation in migrations", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        firstName: Schema.String,
        lastName: Schema.String,
      })
        .evolve(
          "v2",
          { firstName: null, lastName: null, fullName: Schema.String },
          (v) => ({
            id: v.id,
            fullName: `${v.firstName} ${v.lastName}`,
          }),
        )
        .build();

      const decoded = yield* schema.decode({
        _v: "v1",
        id: "t1",
        firstName: "John",
        lastName: "Doe",
      });
      expect(decoded).toEqual({ id: schema.makeId("t1"), fullName: "John Doe" });
    }),
  );
});

describe("roundtrip encode/decode", () => {
  it.effect("preserves data through encode → decode cycle", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        name: Schema.String,
        count: StringToNumber,
      }).build();

      const original = { id: schema.makeId("t1"), name: "test", count: 42 };
      const encoded = yield* schema.encode(original);
      const decoded = yield* schema.decode(encoded);

      expect(decoded).toEqual({
        id: schema.makeId("t1"),
        name: "test",
        count: 42,
      });
    }),
  );

  it.effect("preserves data through decode → encode cycle", () =>
    Effect.gen(function* () {
      const schema = ESchema.make("Test", "id", {
        count: StringToNumber,
      }).build();

      const raw = { _v: "v1", id: "t1", count: "123" };
      const decoded = yield* schema.decode(raw);
      const encoded = yield* schema.encode(decoded);

      expect(encoded).toEqual({ _v: "v1", id: "t1", count: "123" });
    }),
  );
});

describe("Standard Schema v1 compatibility", () => {
  it("has ~standard property with correct structure", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const standard = schema["~standard"];
    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe("@std-toolkit/eschema");
    expect(typeof standard.validate).toBe("function");
  });

  it("validate() returns success result for valid input", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
      age: Schema.Number,
    }).build();

    const result = schema["~standard"].validate({
      _v: "v1",
      id: "u1",
      name: "Alice",
      age: 30,
    });

    expect(result).toEqual({
      value: { id: schema.makeId("u1"), name: "Alice", age: 30 },
    });
  });

  it("validate() returns failure result with issues for invalid input", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const result = schema["~standard"].validate({
      _v: "v99",
      id: "u1",
      name: "Alice",
    });

    expect("issues" in result).toBe(true);
    if ("issues" in result && result.issues) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]?.message).toContain("Unknown schema version");
    }
  });

  it("validate() defaults to latest version when _v is missing", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const result = schema["~standard"].validate({
      id: "u1",
      name: "Alice",
    });

    expect(result).toEqual({
      value: { id: schema.makeId("u1"), name: "Alice" },
    });
  });

  it("implements StandardSchemaV1 interface correctly", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const _standard: StandardSchemaV1 = schema;
    expect(_standard["~standard"].version).toBe(1);
  });

  it("works with evolved schemas", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    })
      .evolve("v2", { email: Schema.String }, (v) => ({
        ...v,
        email: "default@example.com",
      }))
      .build();

    const v1Result = schema["~standard"].validate({
      _v: "v1",
      id: "u1",
      name: "Alice",
    });

    expect(v1Result).toEqual({
      value: {
        id: schema.makeId("u1"),
        name: "Alice",
        email: "default@example.com",
      },
    });

    const v2Result = schema["~standard"].validate({
      _v: "v2",
      id: "u2",
      name: "Bob",
      email: "bob@example.com",
    });

    expect(v2Result).toEqual({
      value: {
        id: schema.makeId("u2"),
        name: "Bob",
        email: "bob@example.com",
      },
    });
  });
});

describe("ESchema.getDescriptor", () => {
  it("returns JSON Schema for encoded type including id field", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
      age: Schema.Number,
    }).build();

    const descriptor = schema.getDescriptor();

    expect(descriptor.type).toBe("object");
    expect(descriptor.properties).toHaveProperty("id");
    expect(descriptor.properties).toHaveProperty("name");
    expect(descriptor.properties).toHaveProperty("age");
    expect(descriptor.properties).toHaveProperty("_v");
  });

  it("includes _v as literal with latest version", () => {
    const schema = ESchema.make("Test", "id", {
      a: Schema.String,
    }).build();

    const descriptor = schema.getDescriptor();
    const versionSchema = descriptor.properties._v as { enum?: string[] };

    expect(versionSchema.enum).toEqual(["v1"]);
  });

  it("reflects evolved schema with correct version", () => {
    const schema = ESchema.make("Test", "id", {
      a: Schema.String,
    })
      .evolve("v2", { b: Schema.Number }, (v) => ({
        ...v,
        b: 0,
      }))
      .build();

    const descriptor = schema.getDescriptor();
    const versionSchema = descriptor.properties._v as { enum?: string[] };

    expect(descriptor.properties).toHaveProperty("id");
    expect(descriptor.properties).toHaveProperty("a");
    expect(descriptor.properties).toHaveProperty("b");
    expect(versionSchema.enum).toEqual(["v2"]);
  });

  it("represents encoded types correctly for transforms", () => {
    const schema = ESchema.make("Test", "id", {
      count: StringToNumber,
    }).build();

    const descriptor = schema.getDescriptor();
    const countSchema = descriptor.properties.count as { type?: string };

    // StringToNumber encodes numbers as strings
    expect(countSchema.type).toBe("string");
  });

  it("includes branded id in $defs", () => {
    const schema = ESchema.make("User", "id", {
      name: Schema.String,
    }).build();

    const descriptor = schema.getDescriptor();

    expect(descriptor.$defs).toHaveProperty("UserId");
    expect(descriptor.properties.id).toEqual({ $ref: "#/$defs/UserId" });
  });
});

describe("brandedString", () => {
  it("creates a branded string with identifier annotation", () => {
    const UserId = brandedString("UserId");
    const schema = ESchema.make("User", "id", {
      ownerId: UserId,
    }).build();

    const descriptor = schema.getDescriptor();

    expect(descriptor.$defs).toHaveProperty("UserId");
    expect(descriptor.properties.ownerId).toEqual({ $ref: "#/$defs/UserId" });
  });

  it("creates $ref relationships across schemas", () => {
    const UserId = brandedString("UserId");

    const userSchema = ESchema.make("User", "id", {
      ownerId: UserId,
    }).build();

    const postSchema = ESchema.make("Post", "id", {
      authorId: UserId,
    }).build();

    const userDescriptor = userSchema.getDescriptor();
    const postDescriptor = postSchema.getDescriptor();

    // Both reference the same $def
    expect(userDescriptor.properties.ownerId).toEqual({
      $ref: "#/$defs/UserId",
    });
    expect(postDescriptor.properties.authorId).toEqual({
      $ref: "#/$defs/UserId",
    });
  });
});

describe("ForbidIdField enforcement", () => {
  it("id field is auto-added and cannot be in user schema", () => {
    // This test verifies the runtime behavior
    // Type-level enforcement is checked at compile time
    const schema = ESchema.make("Test", "testId", {
      name: Schema.String,
    }).build();

    expect(schema.idField).toBe("testId");
    expect(Object.keys(schema.schema)).toContain("testId");
  });
});

describe("Branded ID type safety", () => {
  it.effect("decoded id is properly branded", () =>
    Effect.gen(function* () {
      const userSchema = ESchema.make("User", "id", {
        name: Schema.String,
      }).build();

      const decoded = yield* userSchema.decode({
        id: "u1",
        name: "Alice",
      });

      // The decoded.id should be branded as UserId
      // This is a type-level check - at runtime it's just a string
      expect(decoded.id).toBe("u1");

      // Can use makeId to create compatible IDs
      const newId = userSchema.makeId("u2");
      expect(newId).toBe("u2");
    }),
  );

  it.effect("encoded id is also branded", () =>
    Effect.gen(function* () {
      const userSchema = ESchema.make("User", "id", {
        name: Schema.String,
      }).build();

      const encoded = yield* userSchema.encode({
        id: userSchema.makeId("u1"),
        name: "Alice",
      });

      // The encoded.id should also be branded as UserId
      // This allows passing encoded output directly to other operations
      expect(encoded.id).toBe("u1");

      // Can use the encoded id directly with encode (type-safe)
      const reEncoded = yield* userSchema.encode({
        id: encoded.id,
        name: "Bob",
      });
      expect(reEncoded.id).toBe("u1");
    }),
  );
});
