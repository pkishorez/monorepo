import type { Manifest, Shape } from "./schemas.js";

// TypeScript reserved words that need prefixing
const TYPESCRIPT_RESERVED_WORDS = new Set([
  "Date", "String", "Number", "Boolean", "Record", "Array", "Object",
  "Promise", "Function", "Error", "RegExp", "Map", "Set", "Symbol",
  "string", "number", "boolean", "object", "undefined", "null", "void",
  "any", "unknown", "never", "bigint", "symbol", "type", "interface",
  "enum", "class", "function", "var", "let", "const", "import", "export",
]);

// Fields that support streaming in DynamoDB
const STREAMING_FIELDS = new Set(["StreamSpecification", "Stream"]);

export interface TypeGenOptions {
  manifest: Manifest;
  typeNameMapping: Map<string, string>;
  responseErrorTypeName: string;
  inputShapes: Set<string>;
  outputShapes: Set<string>;
}

export function extractShapeName(shapeId: string): string {
  const parts = shapeId.split("#");
  return parts[1] || "";
}

export function getTypescriptSafeName(shapeName: string): string {
  return TYPESCRIPT_RESERVED_WORDS.has(shapeName)
    ? `DynamoDB${shapeName}`
    : shapeName;
}

export function toLowerCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function isRequired(traits: Record<string, any> | undefined): boolean {
  return !!(traits && "smithy.api#required" in traits);
}

export function shouldSupportStreaming(memberName: string, shapeName: string): boolean {
  return STREAMING_FIELDS.has(memberName) || STREAMING_FIELDS.has(shapeName);
}

export function mapSmithyTypeToTypeScript(
  shape: Shape,
  shapeName: string,
  memberName?: string,
  contextShapeName?: string,
  options: TypeGenOptions = {} as TypeGenOptions,
): string {
  const { responseErrorTypeName = "ResponseError", inputShapes, outputShapes } = options;

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

export function generateTypeReference(
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

  // Handle Smithy built-in types
  const builtinTypeMap: Record<string, string> = {
    "smithy.api#Unit": "{}",
    "smithy.api#String": "string",
    "smithy.api#Boolean": "boolean",
    "smithy.api#PrimitiveBoolean": "boolean",
    "smithy.api#Integer": "number",
    "smithy.api#Long": "number",
    "smithy.api#PrimitiveLong": "number",
    "smithy.api#Float": "number",
    "smithy.api#Double": "number",
    "smithy.api#Timestamp": "Date | string",
    "smithy.api#Document": "unknown",
  };

  if (builtinTypeMap[target]) {
    return builtinTypeMap[target];
  }

  // Handle Blob type specially for streaming
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
      if (targetShape.type === "list" && "member" in targetShape && targetShape.member) {
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
      if (targetShape.type === "map" && "key" in targetShape && "value" in targetShape && targetShape.key && targetShape.value) {
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
