import { describe, it, expect } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  CommandPayloadSchema,
  CommandResponseSchema,
  CommandErrorSchema,
  InsertPayloadSchema,
  UpdatePayloadSchema,
  DeletePayloadSchema,
  QueryPayloadSchema,
  DescriptorPayloadSchema,
  InsertResponseSchema,
  UpdateResponseSchema,
  DeleteResponseSchema,
  QueryResponseSchema,
  DescriptorResponseSchema,
  SkConditionSchema,
  CommandTimingSchema,
  StdDescriptorSchema,
  IndexDescriptorSchema,
  IndexPatternDescriptorSchema,
} from "../command/schema.js";

// ─── Payload Schema Tests ────────────────────────────────────────────────────

describe("Command Payload Schemas", () => {
  describe("InsertPayloadSchema", () => {
    it.effect("validates valid insert payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "insert",
          entity: "User",
          data: { id: "1", name: "Test" },
        };

        const result = yield* Schema.decodeUnknown(InsertPayloadSchema)(payload);
        expect(result.operation).toBe("insert");
        expect(result.entity).toBe("User");
        expect(result.data).toEqual({ id: "1", name: "Test" });
      }),
    );

    it.effect("rejects invalid operation", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "invalid",
          entity: "User",
          data: {},
        };

        const result = yield* Schema.decodeUnknown(InsertPayloadSchema)(payload).pipe(
          Effect.either,
        );
        expect(result._tag).toBe("Left");
      }),
    );
  });

  describe("UpdatePayloadSchema", () => {
    it.effect("validates valid update payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "update",
          entity: "User",
          key: { id: "1" },
          data: { name: "Updated" },
        };

        const result = yield* Schema.decodeUnknown(UpdatePayloadSchema)(payload);
        expect(result.operation).toBe("update");
        expect(result.key).toEqual({ id: "1" });
        expect(result.data).toEqual({ name: "Updated" });
      }),
    );
  });

  describe("DeletePayloadSchema", () => {
    it.effect("validates valid delete payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "delete",
          entity: "User",
          key: { id: "1" },
        };

        const result = yield* Schema.decodeUnknown(DeletePayloadSchema)(payload);
        expect(result.operation).toBe("delete");
        expect(result.key).toEqual({ id: "1" });
      }),
    );
  });

  describe("QueryPayloadSchema", () => {
    it.effect("validates valid query payload with >= operator", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "query",
          entity: "User",
          index: "primary",
          pk: { tenantId: "t1" },
          sk: { ">=": null },
        };

        const result = yield* Schema.decodeUnknown(QueryPayloadSchema)(payload);
        expect(result.operation).toBe("query");
        expect(result.index).toBe("primary");
        expect(result.sk).toEqual({ ">=": null });
      }),
    );

    it.effect("validates query with limit", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "query",
          entity: "User",
          index: "primary",
          pk: {},
          sk: { "<=": "z" },
          limit: 10,
        };

        const result = yield* Schema.decodeUnknown(QueryPayloadSchema)(payload);
        expect(result.limit).toBe(10);
      }),
    );

    it.effect("validates query without limit", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "query",
          entity: "User",
          index: "primary",
          pk: {},
          sk: { ">": "a" },
        };

        const result = yield* Schema.decodeUnknown(QueryPayloadSchema)(payload);
        expect(result.limit).toBeUndefined();
      }),
    );
  });

  describe("DescriptorPayloadSchema", () => {
    it.effect("validates descriptor payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "descriptor",
        };

        const result = yield* Schema.decodeUnknown(DescriptorPayloadSchema)(payload);
        expect(result.operation).toBe("descriptor");
      }),
    );
  });

  describe("SkConditionSchema", () => {
    it.effect("validates >= operator", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(SkConditionSchema)({ ">=": null });
        expect(result).toEqual({ ">=": null });
      }),
    );

    it.effect("validates > operator with value", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(SkConditionSchema)({ ">": "abc" });
        expect(result).toEqual({ ">": "abc" });
      }),
    );

    it.effect("validates <= operator", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(SkConditionSchema)({ "<=": null });
        expect(result).toEqual({ "<=": null });
      }),
    );

    it.effect("validates < operator with value", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(SkConditionSchema)({ "<": "xyz" });
        expect(result).toEqual({ "<": "xyz" });
      }),
    );
  });

  describe("CommandPayloadSchema (union)", () => {
    it.effect("discriminates insert payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "insert",
          entity: "User",
          data: {},
        };

        const result = yield* Schema.decodeUnknown(CommandPayloadSchema)(payload);
        expect(result.operation).toBe("insert");
      }),
    );

    it.effect("discriminates update payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "update",
          entity: "User",
          key: {},
          data: {},
        };

        const result = yield* Schema.decodeUnknown(CommandPayloadSchema)(payload);
        expect(result.operation).toBe("update");
      }),
    );

    it.effect("discriminates delete payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "delete",
          entity: "User",
          key: {},
        };

        const result = yield* Schema.decodeUnknown(CommandPayloadSchema)(payload);
        expect(result.operation).toBe("delete");
      }),
    );

    it.effect("discriminates query payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "query",
          entity: "User",
          index: "primary",
          pk: {},
          sk: { ">=": null },
        };

        const result = yield* Schema.decodeUnknown(CommandPayloadSchema)(payload);
        expect(result.operation).toBe("query");
      }),
    );

    it.effect("discriminates descriptor payload", () =>
      Effect.gen(function* () {
        const payload = {
          operation: "descriptor",
        };

        const result = yield* Schema.decodeUnknown(CommandPayloadSchema)(payload);
        expect(result.operation).toBe("descriptor");
      }),
    );
  });
});

// ─── Response Schema Tests ───────────────────────────────────────────────────

describe("Command Response Schemas", () => {
  const validTiming = {
    startedAt: 1000,
    completedAt: 1100,
    durationMs: 100,
  };

  const validEntityData = {
    value: { id: "1", name: "Test" },
    meta: {
      _v: "v1",
      _e: "User",
      _d: false,
      _uid: "uid-123",
    },
  };

  describe("InsertResponseSchema", () => {
    it.effect("validates insert response", () =>
      Effect.gen(function* () {
        const response = {
          operation: "insert",
          entity: "User",
          timing: validTiming,
          data: validEntityData,
        };

        const result = yield* Schema.decodeUnknown(InsertResponseSchema)(response);
        expect(result.operation).toBe("insert");
        expect(result.data.value).toEqual({ id: "1", name: "Test" });
      }),
    );
  });

  describe("UpdateResponseSchema", () => {
    it.effect("validates update response", () =>
      Effect.gen(function* () {
        const response = {
          operation: "update",
          entity: "User",
          timing: validTiming,
          data: validEntityData,
        };

        const result = yield* Schema.decodeUnknown(UpdateResponseSchema)(response);
        expect(result.operation).toBe("update");
      }),
    );
  });

  describe("DeleteResponseSchema", () => {
    it.effect("validates delete response", () =>
      Effect.gen(function* () {
        const response = {
          operation: "delete",
          entity: "User",
          timing: validTiming,
          data: { ...validEntityData, meta: { ...validEntityData.meta, _d: true } },
        };

        const result = yield* Schema.decodeUnknown(DeleteResponseSchema)(response);
        expect(result.operation).toBe("delete");
        expect(result.data.meta._d).toBe(true);
      }),
    );
  });

  describe("QueryResponseSchema", () => {
    it.effect("validates query response with items", () =>
      Effect.gen(function* () {
        const response = {
          operation: "query",
          entity: "User",
          timing: validTiming,
          items: [validEntityData, validEntityData],
        };

        const result = yield* Schema.decodeUnknown(QueryResponseSchema)(response);
        expect(result.operation).toBe("query");
        expect(result.items).toHaveLength(2);
      }),
    );

    it.effect("validates query response with empty items", () =>
      Effect.gen(function* () {
        const response = {
          operation: "query",
          entity: "User",
          timing: validTiming,
          items: [],
        };

        const result = yield* Schema.decodeUnknown(QueryResponseSchema)(response);
        expect(result.items).toHaveLength(0);
      }),
    );
  });

  describe("DescriptorResponseSchema", () => {
    it.effect("validates descriptor response", () =>
      Effect.gen(function* () {
        const response = {
          operation: "descriptor",
          timing: validTiming,
          descriptors: [
            {
              name: "User",
              version: "v1",
              primaryIndex: {
                name: "primary",
                pk: { deps: [], pattern: "User" },
                sk: { deps: ["userId"], pattern: "{userId}" },
              },
              secondaryIndexes: [],
              schema: { type: "object" },
            },
          ],
        };

        const result = yield* Schema.decodeUnknown(DescriptorResponseSchema)(response);
        expect(result.operation).toBe("descriptor");
        expect(result.descriptors).toHaveLength(1);
        expect(result.descriptors[0]!.name).toBe("User");
      }),
    );

    it.effect("validates descriptor response with empty descriptors", () =>
      Effect.gen(function* () {
        const response = {
          operation: "descriptor",
          timing: validTiming,
          descriptors: [],
        };

        const result = yield* Schema.decodeUnknown(DescriptorResponseSchema)(response);
        expect(result.descriptors).toHaveLength(0);
      }),
    );
  });

  describe("CommandResponseSchema (union)", () => {
    it.effect("discriminates responses by operation", () =>
      Effect.gen(function* () {
        const insertResponse = {
          operation: "insert",
          entity: "User",
          timing: validTiming,
          data: validEntityData,
        };

        const queryResponse = {
          operation: "query",
          entity: "User",
          timing: validTiming,
          items: [],
        };

        const insert = yield* Schema.decodeUnknown(CommandResponseSchema)(insertResponse);
        const query = yield* Schema.decodeUnknown(CommandResponseSchema)(queryResponse);

        expect(insert.operation).toBe("insert");
        expect(query.operation).toBe("query");
      }),
    );
  });
});

// ─── Timing Schema Tests ─────────────────────────────────────────────────────

describe("CommandTimingSchema", () => {
  it.effect("validates timing with all fields", () =>
    Effect.gen(function* () {
      const timing = {
        startedAt: Date.now(),
        completedAt: Date.now() + 100,
        durationMs: 100,
      };

      const result = yield* Schema.decodeUnknown(CommandTimingSchema)(timing);
      expect(result.durationMs).toBe(100);
    }),
  );

  it.effect("rejects missing fields", () =>
    Effect.gen(function* () {
      const timing = {
        startedAt: Date.now(),
      };

      const result = yield* Schema.decodeUnknown(CommandTimingSchema)(timing).pipe(
        Effect.either,
      );
      expect(result._tag).toBe("Left");
    }),
  );
});

// ─── Error Schema Tests ──────────────────────────────────────────────────────

describe("CommandErrorSchema", () => {
  it("creates error with all fields", () => {
    const error = new CommandErrorSchema({
      operation: "insert",
      entity: "User",
      message: "Insert failed",
      cause: new Error("Database error"),
    });

    expect(error._tag).toBe("CommandError");
    expect(error.operation).toBe("insert");
    expect(error.entity).toBe("User");
    expect(error.message).toBe("Insert failed");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("creates error without cause", () => {
    const error = new CommandErrorSchema({
      operation: "query",
      entity: "Post",
      message: "Query failed",
    });

    expect(error._tag).toBe("CommandError");
    expect(error.cause).toBeUndefined();
  });

  it("supports all operation types", () => {
    const operations = ["insert", "update", "delete", "query", "descriptor"] as const;

    for (const operation of operations) {
      const error = new CommandErrorSchema({
        operation,
        entity: "Test",
        message: `${operation} failed`,
      });
      expect(error.operation).toBe(operation);
    }
  });
});

// ─── Descriptor Schema Tests ─────────────────────────────────────────────────

describe("Descriptor Schemas", () => {
  describe("IndexPatternDescriptorSchema", () => {
    it.effect("validates index pattern", () =>
      Effect.gen(function* () {
        const pattern = {
          deps: ["tenantId", "userId"],
          pattern: "Tenant#{tenantId}#User#{userId}",
        };

        const result = yield* Schema.decodeUnknown(IndexPatternDescriptorSchema)(pattern);
        expect(result.deps).toEqual(["tenantId", "userId"]);
        expect(result.pattern).toContain("Tenant");
      }),
    );

    it.effect("validates empty deps", () =>
      Effect.gen(function* () {
        const pattern = {
          deps: [],
          pattern: "User",
        };

        const result = yield* Schema.decodeUnknown(IndexPatternDescriptorSchema)(pattern);
        expect(result.deps).toHaveLength(0);
      }),
    );
  });

  describe("IndexDescriptorSchema", () => {
    it.effect("validates index descriptor", () =>
      Effect.gen(function* () {
        const index = {
          name: "byEmail",
          pk: { deps: ["email"], pattern: "{email}" },
          sk: { deps: ["_uid"], pattern: "{_uid}" },
        };

        const result = yield* Schema.decodeUnknown(IndexDescriptorSchema)(index);
        expect(result.name).toBe("byEmail");
        expect(result.pk.deps).toContain("email");
      }),
    );
  });

  describe("StdDescriptorSchema", () => {
    it.effect("validates full descriptor", () =>
      Effect.gen(function* () {
        const descriptor = {
          name: "User",
          version: "v1",
          primaryIndex: {
            name: "primary",
            pk: { deps: [], pattern: "User" },
            sk: { deps: ["userId"], pattern: "{userId}" },
          },
          secondaryIndexes: [
            {
              name: "byEmail",
              pk: { deps: ["email"], pattern: "{email}" },
              sk: { deps: ["_uid"], pattern: "{_uid}" },
            },
          ],
          schema: { type: "object", properties: {} },
        };

        const result = yield* Schema.decodeUnknown(StdDescriptorSchema)(descriptor);
        expect(result.name).toBe("User");
        expect(result.version).toBe("v1");
        expect(result.secondaryIndexes).toHaveLength(1);
      }),
    );

    it.effect("validates descriptor with timeline index", () =>
      Effect.gen(function* () {
        const descriptor = {
          name: "Event",
          version: "v1",
          primaryIndex: {
            name: "primary",
            pk: { deps: ["streamId"], pattern: "Event#{streamId}" },
            sk: { deps: ["eventId"], pattern: "{eventId}" },
          },
          timelineIndex: {
            name: "timeline",
            pk: { deps: ["streamId"], pattern: "Event#{streamId}" },
            sk: { deps: ["_uid"], pattern: "{_uid}" },
          },
          secondaryIndexes: [],
          schema: {},
        };

        const result = yield* Schema.decodeUnknown(StdDescriptorSchema)(descriptor);
        expect(result.timelineIndex).toBeDefined();
        expect(result.timelineIndex!.name).toBe("timeline");
      }),
    );

    it.effect("validates descriptor without timeline index", () =>
      Effect.gen(function* () {
        const descriptor = {
          name: "Simple",
          version: "v1",
          primaryIndex: {
            name: "primary",
            pk: { deps: [], pattern: "Simple" },
            sk: { deps: ["id"], pattern: "{id}" },
          },
          secondaryIndexes: [],
          schema: {},
        };

        const result = yield* Schema.decodeUnknown(StdDescriptorSchema)(descriptor);
        expect(result.timelineIndex).toBeUndefined();
      }),
    );
  });
});
