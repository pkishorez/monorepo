import type { Manifest } from "./schemas.js";
import type { TypeGenOptions } from "./type-mapper.js";
import { Effect } from "effect";
import {
  generateEnumType,
  generateErrorInterface,
  generateListType,
  generateMapType,
  generatePrimitiveType,
  generateStructureInterface,
  generateUnionType,
} from "./code-generator.js";
import {
  extractShapeName,
  getTypescriptSafeName,
  shouldSupportStreaming,
  toLowerCamelCase,
} from "./type-mapper.js";

interface Operation {
  name: string;
  shape: any;
}

export function generateDynamoDBCode(manifest: Manifest) {
  return Effect.gen(function* () {
    // Find service shape
    const serviceShapeEntry = Object.entries(manifest.shapes).find(
      ([, shape]) => shape.type === "service",
    );
    if (!serviceShapeEntry) {
      return yield* Effect.fail(
        new Error("No service shape found in DynamoDB manifest"),
      );
    }

    const [, serviceShape] = serviceShapeEntry;

    // Collect operations
    const operations = collectOperations(manifest, serviceShape);

    // Build input/output shape sets
    const { inputShapes, outputShapes } = buildShapeSets(operations);

    // Create type name mapping
    const typeNameMapping = createTypeNameMapping(manifest);

    // Check what imports we need
    const imports = analyzeImports(manifest, inputShapes);

    // Create type generation options
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

    // Generate the code
    let code = generateHeader();
    code += generateImports(imports);
    code += generateServiceClass(operations, typeNameMapping);
    code += generateTypes(manifest, typeNameMapping, createTypeGenOptions);
    return code;
  });
}

function collectOperations(manifest: Manifest, serviceShape: any): Operation[] {
  const operations: Operation[] = [];

  // Collect from service shape
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

  // Also collect top-level operations
  for (const [shapeId, shape] of Object.entries(manifest.shapes)) {
    if (shape.type === "operation") {
      const opName = extractShapeName(shapeId);
      if (!operations.find((op) => op.name === opName)) {
        operations.push({ name: opName, shape: shape as any });
      }
    }
  }

  return operations;
}

function buildShapeSets(operations: Operation[]) {
  const inputShapes = new Set<string>();
  const outputShapes = new Set<string>();

  for (const operation of operations) {
    if (operation.shape.input) {
      inputShapes.add(extractShapeName(operation.shape.input.target));
    }
    if (operation.shape.output) {
      outputShapes.add(extractShapeName(operation.shape.output.target));
    }
  }

  return { inputShapes, outputShapes };
}

function createTypeNameMapping(manifest: Manifest): Map<string, string> {
  const typeNameMapping = new Map<string, string>();

  const allShapes = Object.entries(manifest.shapes)
    .filter(([shapeId]) => shapeId.includes("#"))
    .sort(([a], [b]) => {
      const aName = extractShapeName(a);
      const bName = extractShapeName(b);
      return aName.localeCompare(bName);
    });

  for (const [shapeId] of allShapes) {
    const shapeName = extractShapeName(shapeId);
    const safeTypeName = getTypescriptSafeName(shapeName);
    if (safeTypeName !== shapeName) {
      typeNameMapping.set(shapeName, safeTypeName);
    }
  }

  return typeNameMapping;
}

function analyzeImports(manifest: Manifest, inputShapes: Set<string>) {
  const imports = {
    needsDataImport: false,
    needsStreamImport: false,
    needsBufferSupport: false,
  };

  for (const [shapeId, shape] of Object.entries(manifest.shapes)) {
    // Check for error shapes
    if (
      shape.type === "structure" &&
      shape.traits &&
      "smithy.api#error" in shape.traits
    ) {
      imports.needsDataImport = true;
    }

    // Check for streaming fields
    if (shape.type === "structure" && "members" in shape && shape.members) {
      const shapeName = extractShapeName(shapeId);
      for (const [memberName, member] of Object.entries(shape.members)) {
        if (shouldSupportStreaming(memberName, shapeName)) {
          const targetShape = manifest.shapes[member.target];
          if (
            (targetShape && targetShape.type === "blob") ||
            member.target === "smithy.api#Blob"
          ) {
            imports.needsStreamImport = true;
            if (inputShapes.has(shapeName)) {
              imports.needsBufferSupport = true;
            }
          }
        }
      }
    }
  }

  return imports;
}

function generateHeader(): string {
  return `// This file is auto-generated from AWS Smithy specs. Do not edit manually.\n\n`;
}

function generateImports(imports: {
  needsDataImport: boolean;
  needsStreamImport: boolean;
  needsBufferSupport: boolean;
}): string {
  let code = `import type { Effect${imports.needsStreamImport ? ", Stream" : ""}${imports.needsDataImport ? ", Data as EffectData" : ""} } from "effect";\n`;

  if (imports.needsBufferSupport) {
    code += `import type { Buffer } from "node:buffer";\n`;
  }

  code += `import type { DynamodbError } from "../errors.js";\n\n`;

  return code;
}

function generateServiceClass(
  operations: Operation[],
  typeNameMapping: Map<string, string>,
): string {
  let code = `export interface DynamoDBClientService {\n`;

  for (const operation of operations) {
    const methodName = toLowerCamelCase(operation.name);

    // Get input and output types
    const inputType = getOperationType(operation.shape.input, typeNameMapping);
    const outputType = getOperationType(
      operation.shape.output,
      typeNameMapping,
    );

    // Generate error union type
    const errorTypes = getErrorTypes(operation.shape.errors, typeNameMapping);
    const errorUnion =
      errorTypes.length > 1 ? errorTypes.join(" | ") : errorTypes[0];

    code += `  ${methodName}(\n`;
    code += `    input: ${inputType},\n`;
    code += "  ): Effect.Effect<\n";
    code += `    ${outputType},\n`;
    code += `    ${errorUnion}\n`;
    code += "  >;\n";
  }

  code += "}\n\n";
  return code;
}

function getOperationType(
  ref: { target: string } | undefined,
  typeNameMapping: Map<string, string>,
): string {
  if (!ref) return "{}";
  if (ref.target === "smithy.api#Unit") return "{}";

  const shapeName = extractShapeName(ref.target);
  return typeNameMapping.get(shapeName) || shapeName;
}

function getErrorTypes(
  errors: Array<{ target: string }> | undefined,
  typeNameMapping: Map<string, string>,
): string[] {
  const errorTypes = (errors || []).map(
    (error) =>
      typeNameMapping.get(extractShapeName(error.target)) ||
      extractShapeName(error.target),
  );
  errorTypes.push("DynamodbError");
  return errorTypes;
}

function generateTypes(
  manifest: Manifest,
  typeNameMapping: Map<string, string>,
  createTypeGenOptions: (overrides?: Partial<TypeGenOptions>) => TypeGenOptions,
): string {
  let code = "";
  const generatedTypes = new Set<string>();

  const allShapes = Object.entries(manifest.shapes)
    .filter(([shapeId]) => shapeId.includes("#"))
    .sort(([a], [b]) => {
      const aName = extractShapeName(a);
      const bName = extractShapeName(b);
      return aName.localeCompare(bName);
    });

  for (const [shapeId, shape] of allShapes) {
    const shapeName = extractShapeName(shapeId);
    const finalTypeName = typeNameMapping.get(shapeName) || shapeName;

    if (generatedTypes.has(finalTypeName)) {
      continue;
    }

    generatedTypes.add(finalTypeName);

    switch (shape.type) {
      case "structure":
        if (shape.type === "structure") {
          if (shape.traits && "smithy.api#error" in shape.traits) {
            code += generateErrorInterface(
              finalTypeName,
              shape as any,
              createTypeGenOptions(),
            );
          } else {
            code += generateStructureInterface(
              finalTypeName,
              shape as Extract<typeof shape, { type: "structure" }>,
              createTypeGenOptions(),
            );
          }
        }
        break;
      case "union":
        if (shape.type === "union") {
          code += generateUnionType(
            finalTypeName,
            shape as Extract<typeof shape, { type: "union" }>,
            createTypeGenOptions(),
          );
        }
        break;
      case "enum":
        if (shape.type === "enum") {
          code += generateEnumType(
            finalTypeName,
            shape as Extract<typeof shape, { type: "enum" }>,
          );
        }
        break;
      case "list":
        if (shape.type === "list") {
          code += generateListType(
            finalTypeName,
            shape as Extract<typeof shape, { type: "list" }>,
            createTypeGenOptions(),
          );
        }
        break;
      case "map":
        if (shape.type === "map") {
          code += generateMapType(
            finalTypeName,
            shape as Extract<typeof shape, { type: "map" }>,
            createTypeGenOptions(),
          );
        }
        break;
      case "string":
      case "integer":
      case "long":
      case "float":
      case "double":
      case "boolean":
      case "timestamp":
      case "blob":
      case "document":
        code += generatePrimitiveType(
          finalTypeName,
          shape,
          createTypeGenOptions(),
        );
        break;
    }

    code += "\n";
  }

  return code;
}

