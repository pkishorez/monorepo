import { Schema } from "effect";

// Base trait schema for Smithy traits
const TraitValue = Schema.Union(
  Schema.String,
  Schema.Boolean,
  Schema.Number,
  Schema.Null,
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  Schema.Struct({}),
);

export const Traits = Schema.Record({ key: Schema.String, value: TraitValue });

// Member definition
export const Member = Schema.Struct({
  target: Schema.String,
  traits: Schema.optional(Traits),
});

export const Members = Schema.Record({ key: Schema.String, value: Member });

// Operation reference
const OperationReference = Schema.Struct({
  target: Schema.String,
});

// Shape definitions
const OperationShape = Schema.Struct({
  type: Schema.Literal("operation"),
  input: Schema.optional(Schema.Struct({ target: Schema.String })),
  output: Schema.optional(Schema.Struct({ target: Schema.String })),
  errors: Schema.optional(
    Schema.Array(Schema.Struct({ target: Schema.String })),
  ),
  traits: Schema.optional(Traits),
});

const ServiceShape = Schema.Struct({
  type: Schema.Literal("service"),
  operations: Schema.optional(Schema.Array(OperationReference)),
  version: Schema.String,
  traits: Schema.optional(Traits),
});

const StructureShape = Schema.Struct({
  type: Schema.Literal("structure"),
  members: Schema.optional(Members),
  traits: Schema.optional(Traits),
});

const UnionShape = Schema.Struct({
  type: Schema.Literal("union"),
  members: Schema.optional(Members),
  traits: Schema.optional(Traits),
});

const EnumShape = Schema.Struct({
  type: Schema.Literal("enum"),
  members: Schema.optional(Members),
  traits: Schema.optional(Traits),
});

const ListShape = Schema.Struct({
  type: Schema.Literal("list"),
  member: Schema.optional(Schema.Struct({ target: Schema.String })),
  traits: Schema.optional(Traits),
});

const MapShape = Schema.Struct({
  type: Schema.Literal("map"),
  key: Schema.optional(Schema.Struct({ target: Schema.String })),
  value: Schema.optional(Schema.Struct({ target: Schema.String })),
  traits: Schema.optional(Traits),
});

// Simple shapes
function SimpleShapeSchema(type: string) {
  return Schema.Struct({
    type: Schema.Literal(type),
    traits: Schema.optional(Traits),
  });
}

export const Shape = Schema.Union(
  OperationShape,
  ServiceShape,
  StructureShape,
  UnionShape,
  EnumShape,
  ListShape,
  MapShape,
  SimpleShapeSchema("boolean"),
  SimpleShapeSchema("integer"),
  SimpleShapeSchema("double"),
  SimpleShapeSchema("float"),
  SimpleShapeSchema("long"),
  SimpleShapeSchema("string"),
  SimpleShapeSchema("timestamp"),
  SimpleShapeSchema("resource"),
  SimpleShapeSchema("blob"),
  SimpleShapeSchema("document"),
);

// eslint-disable-next-line ts/no-redeclare
export type Shape = Schema.Schema.Type<typeof Shape>;

// Metadata
const MetadataSuppression = Schema.Struct({
  id: Schema.String,
  namespace: Schema.String,
});

const Metadata = Schema.Struct({
  suppressions: Schema.optional(Schema.Array(MetadataSuppression)),
});

// Main manifest schema
export class Manifest extends Schema.Class<Manifest>("Manifest")({
  smithy: Schema.optional(Schema.String),
  metadata: Schema.optional(Metadata),
  shapes: Schema.Record({ key: Schema.String, value: Shape }),
}) {}

