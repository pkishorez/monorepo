import { HttpClient } from "@effect/platform";
import { Effect, Schema } from "effect";
import { Manifest } from "./schemas.js";

const DYNAMODB_SPEC_URL =
  "https://raw.githubusercontent.com/aws/api-models-aws/refs/heads/main/models/dynamodb/service/2012-08-10/dynamodb-2012-08-10.json";

export function loadManifest() {
  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    console.log(`Fetching DynamoDB specs from GitHub...`);
    const response = yield* client.get(DYNAMODB_SPEC_URL);

    if (response.status !== 200) {
      return yield* Effect.fail(
        new Error(`Failed to fetch DynamoDB specs: HTTP ${response.status}`),
      );
    }

    const content = yield* response.json;
    const manifest = yield* Schema.decodeUnknown(Manifest)(content);

    return { manifest, rawJson: content };
  });
}
