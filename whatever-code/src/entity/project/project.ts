import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

export const projectEntity = EntityESchema.make("project", "id", {
  name: Schema.String,
  homePath: Schema.String,
  gitPath: Schema.String,
}).build();
