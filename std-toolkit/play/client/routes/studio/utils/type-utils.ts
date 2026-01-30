import type { TypeDisplay, SchemaProperty } from "../types";
import { typeColors } from "./styles";

export function getTypeDisplay(prop: SchemaProperty): TypeDisplay {
  if (prop.identifier) {
    return {
      type: prop.identifier,
      color: typeColors.reference,
      title: `References ${prop.identifier} entity`,
    };
  }

  if (prop.enum) {
    if (prop.enum.length === 1) {
      return { type: `"${prop.enum[0]}"`, color: typeColors.enum };
    }
    return {
      type: `enum(${prop.enum.length})`,
      color: typeColors.enum,
      title: prop.enum.join(" | "),
    };
  }

  if (prop.type === "string") {
    return { type: "string", color: typeColors.string };
  }

  if (prop.type === "number" || prop.type === "integer") {
    return { type: prop.type, color: typeColors[prop.type] };
  }

  if (prop.type === "boolean") {
    return { type: "boolean", color: typeColors.boolean };
  }

  if (prop.type === "array") {
    return { type: "array", color: typeColors.array };
  }

  if (prop.type === "object") {
    return { type: "object", color: typeColors.object };
  }

  return { type: prop.type || "unknown", color: typeColors.unknown };
}

export function isReferenceField(prop: SchemaProperty): boolean {
  return !!prop.identifier;
}
