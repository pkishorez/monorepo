#!/usr/bin/env bun
/* eslint-disable no-console */

/**
 * Generate Effect types for DynamoDB from Smithy specs
 *
 * This script generates TypeScript types with Effect integration specifically
 * for DynamoDB service from the AWS Smithy models.
 *
 * By default, it fetches the specs from the AWS GitHub repository.
 * Use --local flag to load from local aws-models directory instead.
 *
 * Usage:
 *   bun src/generate.ts [output-path] [--local]
 *
 * Examples:
 *   bun src/generate.ts                                    # Fetch from GitHub, default output
 *   bun src/generate.ts src/services/dynamodb/types.ts     # Fetch from GitHub, custom output
 *   bun src/generate.ts --local                            # Use local specs if available
 */

import { join } from "node:path";
import process from "node:process";
import { FileSystem, HttpClient } from "@effect/platform";
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import { Effect, Schema } from "effect";

// ==================== MANIFEST TYPES AND SCHEMAS ====================

// Base trait schema for common Smithy traits
const TraitValue = Schema.Union(
  Schema.String,
  Schema.Boolean,
  Schema.Number,
  Schema.Null,
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  Schema.Struct({}),
);

const Traits = Schema.Record({ key: Schema.String, value: TraitValue });

// Member definition for structures and unions
const Member = Schema.Struct({
  target: Schema.String,
  traits: Schema.optional(Traits),
});

const Members = Schema.Record({ key: Schema.String, value: Member });

// Operation reference for service operations arrays
const OperationReference = Schema.Struct({
  target: Schema.String,
});

// Enhanced shape definitions with members support
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

// Simple shapes with traits support
const BooleanShape = Schema.Struct({
  type: Schema.Literal("boolean"),
  traits: Schema.optional(Traits),
});
const IntegerShape = Schema.Struct({
  type: Schema.Literal("integer"),
  traits: Schema.optional(Traits),
});
const DoubleShape = Schema.Struct({
  type: Schema.Literal("double"),
  traits: Schema.optional(Traits),
});
const FloatShape = Schema.Struct({
  type: Schema.Literal("float"),
  traits: Schema.optional(Traits),
});
const LongShape = Schema.Struct({
  type: Schema.Literal("long"),
  traits: Schema.optional(Traits),
});
const StringShape = Schema.Struct({
  type: Schema.Literal("string"),
  traits: Schema.optional(Traits),
});
const TimestampShape = Schema.Struct({
  type: Schema.Literal("timestamp"),
  traits: Schema.optional(Traits),
});
const ResourceShape = Schema.Struct({
  type: Schema.Literal("resource"),
  traits: Schema.optional(Traits),
});
const BlobShape = Schema.Struct({
  type: Schema.Literal("blob"),
  traits: Schema.optional(Traits),
});
const DocumentShape = Schema.Struct({
  type: Schema.Literal("document"),
  traits: Schema.optional(Traits),
});

const Shape = Schema.Union(
  OperationShape,
  ServiceShape,
  StructureShape,
  UnionShape,
  EnumShape,
  ListShape,
  MapShape,
  BooleanShape,
  IntegerShape,
  DoubleShape,
  FloatShape,
  LongShape,
  StringShape,
  TimestampShape,
  ResourceShape,
  BlobShape,
  DocumentShape,
);
// eslint-disable-next-line ts/no-redeclare
type Shape = Schema.Schema.Type<typeof Shape>;

// Metadata suppression for Smithy 2.0
const MetadataSuppression = Schema.Struct({
  id: Schema.String,
  namespace: Schema.String,
});

const Metadata = Schema.Struct({
  suppressions: Schema.optional(Schema.Array(MetadataSuppression)),
});

class Manifest extends Schema.Class<Manifest>("Manifest")({
  smithy: Schema.optional(Schema.String), // Support Smithy version
  metadata: Schema.optional(Metadata), // Support metadata
  shapes: Schema.Record({ key: Schema.String, value: Shape }),
}) {}

// Load manifest from GitHub URL
function loadManifestFromGitHub() {
  const DYNAMODB_SPEC_URL =
    "https://raw.githubusercontent.com/aws/api-models-aws/refs/heads/main/models/dynamodb/service/2012-08-10/dynamodb-2012-08-10.json";

  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    console.log(`📡 Fetching DynamoDB specs from GitHub...`);
    const response = yield* client.get(DYNAMODB_SPEC_URL);

    if (response.status !== 200) {
      return yield* Effect.fail(
        new Error(`Failed to fetch DynamoDB specs: HTTP ${response.status}`),
      );
    }

    const content = yield* response.json;
    return yield* Schema.decodeUnknown(Manifest)(content);
  });
}

// Load manifest from local file (fallback)
function loadLocalManifest(filePath: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath);
    const parsed = yield* Effect.try(() => JSON.parse(content));
    return yield* Schema.decodeUnknown(Manifest)(parsed);
  });
}

// ==================== TYPE GENERATION ====================

// Configuration flags
const INCLUDE_DOCUMENTATION = true;

// Fields that should support streaming in DynamoDB (if any)
const STREAMING_FIELDS = new Set(["StreamSpecification", "Stream"]);

// Helper to extract shape name from shape ID
function extractShapeName(shapeId: string): string {
  const parts = shapeId.split("#");
  return parts[1] || "";
}

// Helper to check if a type name conflicts with built-in TypeScript types
function getTypescriptSafeName(shapeName: string): string {
  const conflictingNames = new Set([
    "Date",
    "String",
    "Number",
    "Boolean",
    "Record",
    "Array",
    "Object",
    "Promise",
    "Function",
    "Error",
    "RegExp",
    "Map",
    "Set",
    "Symbol",
    "string",
    "number",
    "boolean",
    "object",
    "undefined",
    "null",
    "void",
    "any",
    "unknown",
    "never",
    "bigint",
    "symbol",
    "type",
    "interface",
    "enum",
    "class",
    "function",
    "var",
    "let",
    "const",
    "import",
    "export",
  ]);

  if (conflictingNames.has(shapeName)) {
    return `DynamoDB${shapeName}`;
  }
  return shapeName;
}

// Helper to convert to lowerCamelCase
function toLowerCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// Helper to check if a field is required
function isRequired(traits: Record<string, any> | undefined): boolean {
  return !!(traits && "smithy.api#required" in traits);
}

// Type generation options
interface TypeGenOptions {
  manifest: Manifest;
  typeNameMapping: Map<string, string>;
  responseErrorTypeName: string;
  inputShapes: Set<string>;
  outputShapes: Set<string>;
}

// Helper to determine if a field should support streaming
function shouldSupportStreaming(
  memberName: string,
  shapeName: string,
): boolean {
  return STREAMING_FIELDS.has(memberName) || STREAMING_FIELDS.has(shapeName);
}

// Helper to map Smithy types to TypeScript
function mapSmithyTypeToTypeScript(
  shape: Shape,
  shapeName: string,
  memberName?: string,
  contextShapeName?: string,
  options: TypeGenOptions = {} as TypeGenOptions,
): string {
  const {
    responseErrorTypeName = "ResponseError",
    inputShapes,
    outputShapes,
  } = options;

  switch (shape.type) {
    case "string":
      return "string";
    case "integer":
    case "long":
    case "float":
    case "double":
      return "number";
    case "boolean":
      return "boolean";
    case "timestamp":
      return "Date | string";
    case "blob":
      if (memberName && shouldSupportStreaming(memberName, shapeName)) {
        if (contextShapeName && inputShapes && outputShapes) {
          if (outputShapes.has(contextShapeName)) {
            return `Stream.Stream<Uint8Array, ${responseErrorTypeName}>`;
          } else if (inputShapes.has(contextShapeName)) {
            return "Uint8Array | string | Buffer | Stream.Stream<Uint8Array>";
          }
        }
        return "Uint8Array | string | Stream.Stream<Uint8Array>";
      }
      return "Uint8Array | string";
    case "document":
      return "unknown";
    default:
      return `_opaque_${shapeName}`;
  }
}

// Helper to generate type reference from shape target
function generateTypeReference(
  target: string,
  memberName?: string,
  contextShapeName?: string,
  options: TypeGenOptions = {} as TypeGenOptions,
): string {
  const {
    manifest,
    typeNameMapping,
    responseErrorTypeName = "ResponseError",
    inputShapes,
    outputShapes,
  } = options;

  // Handle special Smithy built-in types
  if (target === "smithy.api#Unit") return "{}";
  if (target === "smithy.api#String") return "string";
  if (
    target === "smithy.api#Boolean" ||
    target === "smithy.api#PrimitiveBoolean"
  ) {
    return "boolean";
  }
  if (
    target === "smithy.api#Integer" ||
    target === "smithy.api#Long" ||
    target === "smithy.api#PrimitiveLong" ||
    target === "smithy.api#Float" ||
    target === "smithy.api#Double"
  ) {
    return "number";
  }
  if (target === "smithy.api#Timestamp") return "Date | string";
  if (target === "smithy.api#Blob") {
    if (memberName && shouldSupportStreaming(memberName, "")) {
      if (contextShapeName && inputShapes && outputShapes) {
        if (outputShapes.has(contextShapeName)) {
          return `Stream.Stream<Uint8Array, ${responseErrorTypeName}>`;
        } else if (inputShapes.has(contextShapeName)) {
          return "Uint8Array | string | Buffer | Stream.Stream<Uint8Array>";
        }
      }
      return "Uint8Array | string | Stream.Stream<Uint8Array>";
    }
    return "Uint8Array | string";
  }
  if (target === "smithy.api#Document") return "unknown";

  // Check if target exists in manifest shapes
  const targetShape = manifest.shapes[target];
  if (!targetShape) {
    throw new Error(`Cannot resolve type reference: ${target}`);
  }

  const shapeName = extractShapeName(target);
  const finalTypeName = typeNameMapping.get(shapeName) || shapeName;

  switch (targetShape.type) {
    case "string":
    case "integer":
    case "long":
    case "float":
    case "double":
    case "boolean":
    case "timestamp":
    case "blob":
    case "document":
      return mapSmithyTypeToTypeScript(
        targetShape,
        shapeName,
        memberName,
        contextShapeName,
        options,
      );
    case "list":
      if (targetShape.member) {
        const memberType = generateTypeReference(
          targetShape.member.target,
          memberName,
          contextShapeName,
          options,
        );
        return `Array<${memberType}>`;
      }
      return "Array<unknown>";
    case "map":
      if (targetShape.key && targetShape.value) {
        const keyType = generateTypeReference(
          targetShape.key.target,
          undefined,
          contextShapeName,
          options,
        );
        const valueType = generateTypeReference(
          targetShape.value.target,
          undefined,
          contextShapeName,
          options,
        );
        return `Record<${keyType}, ${valueType}>`;
      }
      return "Record<string, unknown>";
    case "structure":
    case "union":
    case "enum":
      return finalTypeName;
    default:
      return finalTypeName;
  }
}

// Helper to get documentation from traits
function getDocumentation(
  traits: Record<string, any> | undefined,
): string | undefined {
  if (!INCLUDE_DOCUMENTATION || !traits) return undefined;

  const docTrait = traits["smithy.api#documentation"];
  if (!docTrait || typeof docTrait !== "string") return undefined;

  const cleanDoc = docTrait
    .replace(/<\/?p>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s+/gm, "")
    .replace(/\n\s*\n/g, "\n")
    .trim();

  if (!cleanDoc) return undefined;
  return `/**\n * ${cleanDoc.split("\n").join("\n * ")}\n */`;
}

// Helper to generate error class
function generateErrorInterface(
  shapeName: string,
  shape: any,
  options: TypeGenOptions,
): string {
  const doc = getDocumentation(shape.traits);
  let code = "";

  if (doc) {
    code += `${doc}\n`;
  }

  code += `export declare class ${shapeName} extends EffectData.TaggedError(\n`;
  code += `  "${shapeName}",\n`;
  code += ")<{\n";

  if (shape.members) {
    for (const [memberName, member] of Object.entries(shape.members)) {
      const memberInfo = member as any;
      const fieldType = generateTypeReference(
        memberInfo.target,
        memberName,
        shapeName,
        options,
      );
      const optional = !isRequired(memberInfo.traits);
      const memberDoc = getDocumentation(memberInfo.traits);

      if (memberDoc) {
        code += `  ${memberDoc
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")}\n`;
      }

      code += `  readonly ${memberName}${optional ? "?" : ""}: ${fieldType};\n`;
    }
  }

  code += "}> {}";
  return code;
}

// Helper to generate structure interface
function generateStructureInterface(
  name: string,
  shape: Extract<Shape, { type: "structure" }>,
  options: TypeGenOptions,
): string {
  const doc = getDocumentation(shape.traits);
  let code = doc ? `${doc}\n` : "";

  code += `export interface ${name} {\n`;
  if (shape.members) {
    for (const [memberName, member] of Object.entries(shape.members)) {
      const memberDoc = getDocumentation(member.traits);
      if (memberDoc) {
        code += `  ${memberDoc
          .split("\n")
          .map((line) => line.replace(/^\s*\*/, "  *"))
          .join("\n")}\n`;
      }
      const isRequiredField = isRequired(member.traits);
      const questionMark = isRequiredField ? "" : "?";
      const fieldType = generateTypeReference(
        member.target,
        memberName,
        name,
        options,
      );
      code += `  ${memberName}${questionMark}: ${fieldType};\n`;
    }
  }
  code += "}";
  return code;
}

// Helper to generate union type
function generateUnionType(
  name: string,
  shape: Extract<Shape, { type: "union" }>,
  options: TypeGenOptions,
): string {
  const doc = getDocumentation(shape.traits);
  let code = doc ? `${doc}\n` : "";

  if (shape.members) {
    const baseName = `_${name}`;
    code += `interface ${baseName} {\n`;
    for (const [memberName, member] of Object.entries(shape.members)) {
      const memberType = generateTypeReference(
        member.target,
        memberName,
        baseName,
        options,
      );
      const memberDoc = getDocumentation(member.traits);

      if (memberDoc) {
        code += `  ${memberDoc
          .split("\n")
          .map((line) => line.replace(/^\s*\*/, "  *"))
          .join("\n")}\n`;
      }

      code += `  ${memberName}?: ${memberType};\n`;
    }
    code += "}\n\n";

    const variants = Object.entries(shape.members).map(
      ([memberName, member]) => {
        const memberType = generateTypeReference(
          member.target,
          memberName,
          baseName,
          options,
        );
        return `(${baseName} & { ${memberName}: ${memberType} })`;
      },
    );

    code += `export type ${name} = ${variants.join(" | ")};`;
  } else {
    code += `export type ${name} = never;`;
  }

  return code;
}

// Helper to generate enum type
function generateEnumType(
  name: string,
  shape: Extract<Shape, { type: "enum" }>,
  _options: TypeGenOptions,
): string {
  const doc = getDocumentation(shape.traits);
  let code = doc ? `${doc}\n` : "";

  if (shape.members) {
    const enumValues = Object.keys(shape.members).map((key) => `"${key}"`);
    code += `export type ${name} = ${enumValues.join(" | ")};`;
  } else {
    code += `export type ${name} = never;`;
  }

  return code;
}

// Helper to generate list type
function generateListType(
  name: string,
  shape: Extract<Shape, { type: "list" }>,
  options: TypeGenOptions,
): string {
  const doc = getDocumentation(shape.traits);
  let code = doc ? `${doc}\n` : "";

  if (shape.member) {
    const memberType = generateTypeReference(
      shape.member.target,
      undefined,
      name,
      options,
    );
    code += `export type ${name} = Array<${memberType}>;`;
  } else {
    code += `export type ${name} = Array<unknown>;`;
  }

  return code;
}

// Helper to generate map type
function generateMapType(
  name: string,
  shape: Extract<Shape, { type: "map" }>,
  options: TypeGenOptions,
): string {
  const doc = getDocumentation(shape.traits);
  let code = doc ? `${doc}\n` : "";

  if (shape.key && shape.value) {
    const keyType = generateTypeReference(
      shape.key.target,
      undefined,
      name,
      options,
    );
    const valueType = generateTypeReference(
      shape.value.target,
      undefined,
      name,
      options,
    );
    code += `export type ${name} = Record<${keyType}, ${valueType}>;`;
  } else {
    code += `export type ${name} = Record<string, unknown>;`;
  }

  return code;
}

function generateDynamoDBCode(manifest: Manifest) {
  return Effect.gen(function* () {
    // Check if we need Data import (only if there are error classes)
    let needsDataImport = false;
    let needsStreamImport = false;
    let needsBufferSupport = false;

    // Create type name mapping for conflicting types
    const typeNameMapping = new Map<string, string>();

    // Find service shape and extract metadata
    const serviceShapeEntry = Object.entries(manifest.shapes).find(
      ([, shape]) => shape.type === "service",
    );
    if (!serviceShapeEntry) {
      return yield* Effect.fail(
        new Error("No service shape found in DynamoDB manifest"),
      );
    }

    const [serviceShapeId, serviceShape] = serviceShapeEntry;
    const serviceShapeName = extractShapeName(serviceShapeId);

    // Collect operations from service shape
    const operations: Array<{ name: string; shape: any }> = [];

    if (serviceShape.type === "service" && serviceShape.operations) {
      for (const opRef of serviceShape.operations) {
        const op = manifest.shapes[opRef.target];
        if (op?.type === "operation") {
          operations.push({
            name: extractShapeName(opRef.target),
            shape: op,
          });
        }
      }
    }

    // Also collect operations defined at top level
    for (const [shapeId, shape] of Object.entries(manifest.shapes)) {
      if (shape.type === "operation") {
        const opName = extractShapeName(shapeId);
        // Check if already added from service
        if (!operations.find((op) => op.name === opName)) {
          operations.push({ name: opName, shape: shape as any });
        }
      }
    }

    // Build maps of input and output shapes from operations
    const inputShapes = new Set<string>();
    const outputShapes = new Set<string>();

    for (const operation of operations) {
      if (operation.shape.input) {
        const inputShapeName = extractShapeName(operation.shape.input.target);
        inputShapes.add(inputShapeName);
      }
      if (operation.shape.output) {
        const outputShapeName = extractShapeName(operation.shape.output.target);
        outputShapes.add(outputShapeName);
      }
    }

    // Create the base options object for type generation
    const createTypeGenOptions = (
      overrides: Partial<TypeGenOptions> = {},
    ): TypeGenOptions => ({
      manifest,
      typeNameMapping,
      responseErrorTypeName: "ResponseError",
      inputShapes,
      outputShapes,
      ...overrides,
    });

    // Check if we need imports
    for (const [_shapeId, shape] of Object.entries(manifest.shapes)) {
      if (
        shape.type === "structure" &&
        shape.traits &&
        "smithy.api#error" in shape.traits
      ) {
        needsDataImport = true;
      }

      if (shape.type === "structure" && shape.members) {
        const shapeName = extractShapeName(_shapeId);
        for (const [memberName, member] of Object.entries(shape.members)) {
          if (shouldSupportStreaming(memberName, shapeName)) {
            const targetShape = manifest.shapes[member.target];
            if (
              (targetShape && targetShape.type === "blob") ||
              member.target === "smithy.api#Blob"
            ) {
              needsStreamImport = true;
              if (inputShapes.has(shapeName)) {
                needsBufferSupport = true;
              }
            }
          }
        }
      }
    }

    // Build type name mapping for conflicting types
    const allShapes = Object.entries(manifest.shapes)
      .filter(([shapeId]) => shapeId.includes("#"))
      .sort(([a], [b]) => {
        const aName = extractShapeName(a);
        const bName = extractShapeName(b);
        return aName.localeCompare(bName);
      });

    for (const [shapeId, _shape] of allShapes) {
      const shapeName = extractShapeName(shapeId);
      const safeTypeName = getTypescriptSafeName(shapeName);
      if (safeTypeName !== shapeName) {
        typeNameMapping.set(shapeName, safeTypeName);
      }
    }

    // Add ESLint disable comments at the very beginning
    let code = `/* eslint-disable ts/no-empty-object-type */\n`;
    code += `/* eslint-disable ts/no-namespace */\n`;
    code += `/* eslint-disable ts/consistent-type-definitions */`;
    code += `\n`;

    // Generate imports
    code += `import type { Effect${needsStreamImport ? ", Stream" : ""}${needsDataImport ? ", Data as EffectData" : ""} } from "effect";\n`;
    if (needsStreamImport) {
      code += `import type { ResponseError } from "@effect/platform/HttpClientError";\n`;
    }
    if (needsBufferSupport) {
      code += `import type { Buffer } from "node:buffer";\n`;
    }
    code += `import type { CommonAwsError } from "../../error.js";\n`;
    code += `import { AWSServiceClient } from "../../client.js";\n\n`;

    // Generate DynamoDB service interface
    code += `export declare class DynamoDB extends AWSServiceClient {\n`;

    for (const operation of operations) {
      const methodName = toLowerCamelCase(operation.name);

      // Get input and output types
      const inputType = operation.shape.input
        ? operation.shape.input.target === "smithy.api#Unit"
          ? "{}"
          : typeNameMapping.get(
              extractShapeName(operation.shape.input.target),
            ) || extractShapeName(operation.shape.input.target)
        : "{}";
      const outputType = operation.shape.output
        ? operation.shape.output.target === "smithy.api#Unit"
          ? "{}"
          : typeNameMapping.get(
              extractShapeName(operation.shape.output.target),
            ) || extractShapeName(operation.shape.output.target)
        : "{}";

      // Generate error union type
      const errors = operation.shape.errors || [];
      const errorTypes = errors.map(
        (error: any) =>
          typeNameMapping.get(extractShapeName(error.target)) ||
          extractShapeName(error.target),
      );
      errorTypes.push("CommonAwsError");

      const errorUnion =
        errorTypes.length > 1 ? errorTypes.join(" | ") : errorTypes[0];
      const effectOutputType =
        !operation.shape.output ||
        operation.shape.output.target === "smithy.api#Unit"
          ? "{}"
          : outputType;

      code += `  ${methodName}(\n`;
      code += `    input: ${inputType},\n`;
      code += "  ): Effect.Effect<\n";
      code += `    ${effectOutputType},\n`;
      code += `    ${errorUnion}\n`;
      code += "  >;\n";
    }

    code += "}\n\n";

    // Track generated type names to avoid duplicates
    const generatedTypes = new Set<string>();

    // Generate type aliases, enums, and interfaces
    for (const [shapeId, shape] of allShapes) {
      const shapeName = extractShapeName(shapeId);
      const finalTypeName = typeNameMapping.get(shapeName) || shapeName;

      // Skip if already generated
      if (generatedTypes.has(finalTypeName)) {
        continue;
      }

      generatedTypes.add(finalTypeName);

      switch (shape.type) {
        case "structure":
          if (shape.traits && "smithy.api#error" in shape.traits) {
            code += generateErrorInterface(
              finalTypeName,
              shape,
              createTypeGenOptions(),
            );
          } else {
            code += generateStructureInterface(
              finalTypeName,
              shape,
              createTypeGenOptions(),
            );
          }
          code += "\n";
          break;
        case "union":
          code += generateUnionType(
            finalTypeName,
            shape,
            createTypeGenOptions(),
          );
          code += "\n";
          break;
        case "enum":
          code += generateEnumType(
            finalTypeName,
            shape,
            createTypeGenOptions(),
          );
          code += "\n";
          break;
        case "list":
          code += generateListType(
            finalTypeName,
            shape,
            createTypeGenOptions(),
          );
          code += "\n";
          break;
        case "map":
          code += generateMapType(finalTypeName, shape, createTypeGenOptions());
          code += "\n";
          break;
        case "string":
        case "integer":
        case "long":
        case "float":
        case "double":
        case "boolean":
        case "timestamp":
        case "blob":
        case "document": {
          const baseType = mapSmithyTypeToTypeScript(
            shape,
            shapeName,
            undefined,
            finalTypeName,
            createTypeGenOptions(),
          );
          const doc = getDocumentation(shape.traits);
          if (doc) {
            code += `${doc}\n`;
          }
          code += `export type ${finalTypeName} = ${baseType};\n\n`;
          break;
        }
      }
    }

    // Generate operation namespaces for error types
    for (const operation of operations) {
      const inputType = operation.shape.input
        ? operation.shape.input.target === "smithy.api#Unit"
          ? "{}"
          : typeNameMapping.get(
              extractShapeName(operation.shape.input.target),
            ) || extractShapeName(operation.shape.input.target)
        : "{}";
      const outputType = operation.shape.output
        ? operation.shape.output.target === "smithy.api#Unit"
          ? "{}"
          : typeNameMapping.get(
              extractShapeName(operation.shape.output.target),
            ) || extractShapeName(operation.shape.output.target)
        : "{}";

      const errors = operation.shape.errors || [];
      const errorTypes = errors.map(
        (error: any) =>
          typeNameMapping.get(extractShapeName(error.target)) ||
          extractShapeName(error.target),
      );
      errorTypes.push("CommonAwsError");

      const errorUnion = errorTypes
        .map((type: any) => `    | ${type}`)
        .join("\n");
      const effectOutputType =
        !operation.shape.output ||
        operation.shape.output.target === "smithy.api#Unit"
          ? "{}"
          : outputType;

      code += `export declare namespace ${operation.name} {\n`;
      code += `  export type Input = ${inputType};\n`;
      code += `  export type Output = ${effectOutputType};\n`;
      code += "  export type Error =\n";
      code += errorUnion;
      code += ";\n";
      code += "}\n\n";
    }

    return code;
  });
}

// Main function
function main(outputPath?: string, useLocal = false) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Default output path
    const output = outputPath || "src/services/dynamodb/types.ts";

    let manifest: Manifest;

    if (useLocal) {
      // Try to load from local file system (legacy behavior)
      const dynamoDbPath = join(
        process.cwd(),
        "aws-models",
        "models",
        "dynamodb",
      );

      try {
        const entries = yield* fs.readDirectory(dynamoDbPath);
        const serviceDir = entries.find((entry) => entry === "service");

        if (!serviceDir) {
          return yield* Effect.fail(
            new Error("DynamoDB service directory not found"),
          );
        }

        const servicePath = join(dynamoDbPath, "service");
        const versions = yield* fs.readDirectory(servicePath);

        // Use the latest version (assuming they're sorted)
        const latestVersion = versions.sort().pop();
        if (!latestVersion) {
          return yield* Effect.fail(new Error("No DynamoDB version found"));
        }

        const versionPath = join(servicePath, latestVersion);
        const files = yield* fs.readDirectory(versionPath);
        const manifestFile = files.find((file) => file.endsWith(".json"));

        if (!manifestFile) {
          return yield* Effect.fail(
            new Error("No DynamoDB manifest file found"),
          );
        }

        const manifestPath = join(versionPath, manifestFile);
        console.log(`📁 Loading DynamoDB manifest from: ${manifestPath}`);

        // Load the manifest from local file
        manifest = yield* loadLocalManifest(manifestPath);
      } catch {
        console.log(`⚠️ Local specs not found, fetching from GitHub...`);
        manifest = yield* loadManifestFromGitHub();
      }
    } else {
      // Default: Load from GitHub
      manifest = yield* loadManifestFromGitHub();
    }

    // Generate the code
    console.log("🔧 Generating DynamoDB Effect types...");
    const code = yield* generateDynamoDBCode(manifest);

    // Ensure output directory exists
    const outputDir = output.substring(0, output.lastIndexOf("/"));
    yield* fs.makeDirectory(outputDir, { recursive: true });

    // Write the generated file
    yield* fs.writeFileString(output, code);

    console.log(`✅ Generated DynamoDB types: ${output}`);

    return output;
  });
}

// CLI handling
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0];
  const useLocal = args.includes("--local");

  const program = main(outputPath, useLocal).pipe(
    Effect.provide(NodeFileSystem.layer),
    Effect.provide(NodeHttpClient.layer),
  );

  Effect.runPromise(program).catch(console.error);
}

export { generateDynamoDBCode, main as generateDynamoDBTypes };
