import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  conformanceTable,
  runConformanceSuite,
} from '../../std-table/__tests__/conformance.js';
import { DynamoDB } from '../index.js';

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const required = process.env.REQUIRE_DYNAMODB_LOCAL === 'true';

if (endpoint === undefined && required)
  throw new Error(
    'DYNAMODB_LOCAL_ENDPOINT is required when REQUIRE_DYNAMODB_LOCAL=true',
  );

if (endpoint !== undefined) {
  let tableNumber = 0;
  runConformanceSuite({
    name: 'DynamoDB Local',
    makeLayer: () => {
      const configured = DynamoDB.make(conformanceTable, {
        tableName: `portable-conformance-${process.pid}-${++tableNumber}`,
        region: 'local',
        endpoint,
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      });
      return Layer.unwrap(configured.setup.pipe(Effect.as(configured.layer)));
    },
  });
} else {
  describe.skip('portable conformance: DynamoDB Local', () => {
    it('requires DYNAMODB_LOCAL_ENDPOINT', () =>
      expect(endpoint).toBeUndefined());
  });
}
