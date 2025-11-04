 
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { generateDynamoDBCode } from "./generator.js";
import { loadManifest } from "./manifest-loader.js";

export function generateDynamoDBTypes(outputPath?: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Default output path
    const output = outputPath || "src/services/dynamodb/types.ts";

    // Load manifest from GitHub (returns both manifest and raw JSON)
    const { manifest, rawJson } = yield* loadManifest();

    // Generate the code
    console.log("🔧 Generating DynamoDB Effect types...");
    const code = yield* generateDynamoDBCode(manifest);

    // Ensure output directory exists
    const outputDir = output.substring(0, output.lastIndexOf("/"));
    yield* fs.makeDirectory(outputDir, { recursive: true });

    // Write the generated types file
    yield* fs.writeFileString(output, code);

    // Write the spec file alongside the types file
    const specPath = output.replace(/\.ts$/, ".spec.json");
    yield* fs.writeFileString(specPath, JSON.stringify(rawJson, null, 2));

    console.log(`✅ Generated DynamoDB types: ${output}`);
    console.log(`✅ Saved DynamoDB spec: ${specPath}`);

    return output;
  });
}

export { generateDynamoDBCode } from "./generator.js";
export { loadManifest } from "./manifest-loader.js";
export type { Manifest } from "./schemas.js";

