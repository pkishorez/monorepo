import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  ESchema,
  SingleEntityESchema,
  EntityESchema,
  type AnyESchema,
  type AnySingleEntityESchema,
  type AnyEntityESchema,
  type ESchemaType,
} from "../index.js";

function acceptsAnyESchema(schema: AnyESchema) {
  return schema.getDescriptor();
}

function acceptsSingleEntity(schema: AnySingleEntityESchema) {
  return schema.name;
}

function acceptsEntity(schema: AnyEntityESchema) {
  return schema.idField;
}

const base = ESchema.make({ a: Schema.String }).build();
const single = SingleEntityESchema.make("Config", {
  a: Schema.String,
}).build();
const entity = EntityESchema.make("User", "id", {
  a: Schema.String,
}).build();

describe("type hierarchy — assignability", () => {
  it("ESchema is accepted where AnyESchema is expected", () => {
    const descriptor = acceptsAnyESchema(base);
    expect(descriptor.type).toBe("object");
  });

  it("SingleEntityESchema is accepted where AnyESchema is expected", () => {
    const descriptor = acceptsAnyESchema(single);
    expect(descriptor.type).toBe("object");
  });

  it("EntityESchema is accepted where AnyESchema is expected", () => {
    const descriptor = acceptsAnyESchema(entity);
    expect(descriptor.type).toBe("object");
  });

  it("EntityESchema is accepted where AnySingleEntityESchema is expected", () => {
    const name = acceptsSingleEntity(entity);
    expect(name).toBe("User");
  });

  it("EntityESchema is accepted where AnyEntityESchema is expected", () => {
    const idField = acceptsEntity(entity);
    expect(idField).toBe("id");
  });

  it("SingleEntityESchema is accepted where AnySingleEntityESchema is expected", () => {
    const name = acceptsSingleEntity(single);
    expect(name).toBe("Config");
  });

  // Type-level: these should NOT compile (verified by @ts-expect-error)
  it("ESchema is NOT assignable to AnySingleEntityESchema", () => {
    // @ts-expect-error — base ESchema has no `name` property
    acceptsSingleEntity(base);
  });

  it("ESchema is NOT assignable to AnyEntityESchema", () => {
    // @ts-expect-error — base ESchema has no `idField` property
    acceptsEntity(base);
  });

  it("SingleEntityESchema is NOT assignable to AnyEntityESchema", () => {
    // @ts-expect-error — SingleEntityESchema has no `idField` property
    acceptsEntity(single);
  });
});

describe("ESchemaType extractor works across all levels", () => {
  it("extracts type from ESchema", () => {
    type T = ESchemaType<typeof base>;
    const _check: T = { a: "hello" };
    expect(_check).toEqual({ a: "hello" });
  });

  it("extracts type from SingleEntityESchema", () => {
    type T = ESchemaType<typeof single>;
    const _check: T = { a: "hello" };
    expect(_check).toEqual({ a: "hello" });
  });

  it("extracts type from EntityESchema", () => {
    type T = ESchemaType<typeof entity>;
    const _check: T = { id: "u1", a: "hello" };
    expect(_check).toEqual({ id: "u1", a: "hello" });
  });
});
