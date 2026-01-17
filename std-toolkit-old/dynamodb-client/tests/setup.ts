/**
 * Test setup configuration for DynamoDB client tests
 *
 * This file configures the test environment for running tests against
 * a local DynamoDB instance on port 8000.
 *
 * Prerequisites:
 * - Local DynamoDB should be running on port 8000
 * - You can start it with: docker run -p 8000:8000 amazon/dynamodb-local
 */

import { beforeAll } from "vitest";

beforeAll(async () => {});

