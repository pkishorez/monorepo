import type { Shape } from "./schemas.js";
import type { TypeGenOptions } from "./type-mapper.js";
import {
  generateTypeReference,
  isRequired,
  mapSmithyTypeToTypeScript,
} from "./type-mapper.js";

const INCLUDE_DOCUMENTATION = true;

export function getDocumentation(
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

export function generateErrorInterface(
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

export function generateStructureInterface(
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

export function generateUnionType(
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

export function generateEnumType(
  name: string,
  shape: Extract<Shape, { type: "enum" }>,
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

export function generateListType(
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

export function generateMapType(
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
    code += `export type ${name} = Record<${keyType}, ${valueType}>`;
  } else {
    code += `export type ${name} = Record<string, unknown>`;
  }

  return code;
}

export function generatePrimitiveType(
  name: string,
  shape: Shape,
  options: TypeGenOptions,
): string {
  const baseType = mapSmithyTypeToTypeScript(
    shape,
    name,
    undefined,
    name,
    options,
  );
  const doc = getDocumentation((shape as any).traits);
  let code = "";
  if (doc) {
    code += `${doc}\n`;
  }
  code += `export type ${name} = ${baseType};`;
  return code;
}

