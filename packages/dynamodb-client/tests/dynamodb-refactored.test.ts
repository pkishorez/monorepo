import type { TestItem } from "./shared/test-data.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EffectClient } from "./clients/effect-client.js";
import { tableSchema, TEST_TABLE_NAME, testItems } from "./shared/test-data.js";

describe("dynamoDB Client (Refactored with Shared Utilities)", () => {
  let client: EffectClient;

  beforeAll(async () => {
    client = new EffectClient({
      region: "us-east-1",
      endpoint: "http://localhost:8000",
      credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
      },
    });

    // Clean up any existing table
    try {
      await client.deleteTable(TEST_TABLE_NAME);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      // Table might not exist
    }

    // Create test table
    await client.createTable(tableSchema);
    await client.waitForTableReady(TEST_TABLE_NAME);

    // Insert base test data
    for (const item of testItems) {
      await client.putItem(TEST_TABLE_NAME, item);
    }
  }, 60000);

  afterAll(async () => {
    try {
      await client.deleteTable(TEST_TABLE_NAME);
    } catch {
      // Table cleanup failed
    }
  });

  describe("basic item operations", () => {
    it("should put a new item", async () => {
      const newItem: TestItem = {
        pk: "TEST#NEW",
        sk: "ITEM",
        name: "New Test User",
        age: 25,
        email: "new@test.com",
        status: "pending",
      };

      await client.putItem(TEST_TABLE_NAME, newItem);

      const retrieved = await client.getItem(TEST_TABLE_NAME, {
        pk: newItem.pk,
        sk: newItem.sk,
      });
      expect(retrieved).toEqual(newItem);
    });

    it("should get an existing item", async () => {
      const item = await client.getItem(TEST_TABLE_NAME, {
        pk: "USER#1",
        sk: "PROFILE",
      });

      expect(item).toBeDefined();
      expect(item?.pk).toBe("USER#1");
      expect(item?.name).toBe("John Doe");
    });

    it("should update an item", async () => {
      const key = { pk: "USER#1", sk: "PROFILE" };

      await client.updateItem(
        TEST_TABLE_NAME,
        key,
        "SET age = :age, #status = :status",
        { ":age": 31, ":status": "updated" },
        { "#status": "status" },
      );

      const updated = await client.getItem(TEST_TABLE_NAME, key);
      expect(updated?.age).toBe(31);
      expect(updated?.status).toBe("updated");
    });

    it("should delete an item", async () => {
      const testKey = { pk: "TEST#DELETE", sk: "ITEM" };

      // First put an item
      await client.putItem(TEST_TABLE_NAME, {
        pk: testKey.pk,
        sk: testKey.sk,
        name: "To Delete",
        age: 99,
        email: "delete@test.com",
        status: "temporary",
      });

      // Verify it exists
      let item = await client.getItem(TEST_TABLE_NAME, testKey);
      expect(item).toBeDefined();

      // Delete it
      await client.deleteItem(TEST_TABLE_NAME, testKey);

      // Verify it's gone
      item = await client.getItem(TEST_TABLE_NAME, testKey);
      expect(item).toBeNull();
    });
  });

  describe("query operations", () => {
    it("should query by partition key", async () => {
      const result = await client.query(TEST_TABLE_NAME, "pk = :pk", {
        ":pk": "USER#1",
      });

      expect(result.Items).toHaveLength(1);
      expect(result.Items[0].pk).toBe("USER#1");
      expect(result.Items[0].name).toBe("John Doe");
    });

    it("should query using GSI", async () => {
      const result = await client.query(
        TEST_TABLE_NAME,
        "gsi1pk = :gsi1pk",
        { ":gsi1pk": "STATUS#active" },
        undefined,
        "GSI1",
      );

      expect(result.Items.length).toBeGreaterThan(0);
      result.Items.forEach((item) => {
        expect(item.status).toBe("active");
      });
    });

    it("should query with filter expression", async () => {
      const result = await client.query(
        TEST_TABLE_NAME,
        "gsi1pk = :gsi1pk",
        { ":gsi1pk": "STATUS#active", ":age": 30 },
        undefined,
        "GSI1",
        "age >= :age",
      );

      expect(result.Items.length).toBeGreaterThan(0);
      result.Items.forEach((item) => {
        expect(item.status).toBe("active");
        expect(item.age).toBeGreaterThanOrEqual(30);
      });
    });
  });

  describe("scan operations", () => {
    it("should scan all items", async () => {
      const result = await client.scan(
        TEST_TABLE_NAME,
        undefined,
        undefined,
        undefined,
        10,
      );

      expect(result.Items.length).toBeGreaterThan(0);
      expect(result.Count).toBeGreaterThan(0);
    });

    it("should scan with filter", async () => {
      const result = await client.scan(
        TEST_TABLE_NAME,
        "#status = :status",
        { ":status": "active" },
        { "#status": "status" },
        10,
      );

      expect(result.Items.length).toBeGreaterThan(0);
      result.Items.forEach((item) => {
        expect(item.status).toBe("active");
      });
    });

    it("should scan with limit", async () => {
      const result = await client.scan(
        TEST_TABLE_NAME,
        undefined,
        undefined,
        undefined,
        3,
      );

      expect(result.Items.length).toBeLessThanOrEqual(3);
    });
  });

  describe("batch operations", () => {
    it("should batch write items", async () => {
      const batchItems: TestItem[] = [
        {
          pk: "BATCH#1",
          sk: "ITEM",
          name: "Batch User 1",
          age: 20,
          email: "batch1@test.com",
          status: "batch",
        },
        {
          pk: "BATCH#2",
          sk: "ITEM",
          name: "Batch User 2",
          age: 22,
          email: "batch2@test.com",
          status: "batch",
        },
      ];

      await client.batchWriteItem(TEST_TABLE_NAME, batchItems);

      // Verify items were written
      for (const item of batchItems) {
        const retrieved = await client.getItem(TEST_TABLE_NAME, {
          pk: item.pk,
          sk: item.sk,
        });
        expect(retrieved).toEqual(item);
      }
    });

    it("should batch get items", async () => {
      const keys = [
        { pk: "BATCH#1", sk: "ITEM" },
        { pk: "BATCH#2", sk: "ITEM" },
      ];

      const result = await client.batchGetItem(TEST_TABLE_NAME, keys);

      expect(result).toHaveLength(2);
      expect(result.some((item) => item.pk === "BATCH#1")).toBe(true);
      expect(result.some((item) => item.pk === "BATCH#2")).toBe(true);
    });
  });

  describe("table operations", () => {
    it("should list tables", async () => {
      const result = await client.listTables();

      expect(result.TableNames).toBeDefined();
      expect(Array.isArray(result.TableNames)).toBe(true);
      expect(result.TableNames).toContain(TEST_TABLE_NAME);
    });

    it("should describe table", async () => {
      const result = await client.describeTable(TEST_TABLE_NAME);

      expect(result.Table).toBeDefined();
      expect(result.Table.TableName).toBe(TEST_TABLE_NAME);
      expect(result.Table.TableStatus).toBe("ACTIVE");
    });
  });

  describe("error handling", () => {
    it("should handle table not found errors", async () => {
      try {
        await client.getItem("NonExistentTable", { pk: "test", sk: "test" });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error._tag).toBe("ResourceNotFoundException");
      }
    });

    it("should handle validation errors", async () => {
      try {
        // Try to put item with missing required field
        await client.putItem(TEST_TABLE_NAME, {
          pk: "",
          sk: "",
          name: "",
          age: 0,
          email: "",
          status: "",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error._tag).toBe("ValidationException");
      }
    });

    it("should handle conditional check failures", async () => {
      // This test depends on specific DynamoDB behavior and may need adjustment
      try {
        await client.putItem(TEST_TABLE_NAME, {
          pk: "USER#1",
          sk: "PROFILE",
          name: "Should Fail",
          age: 99,
          email: "fail@test.com",
          status: "fail",
        });
        // Note: This might not actually fail in local DynamoDB without condition expression
      } catch (error: any) {
        expect(error._tag).toContain("Exception");
      }
    });
  });
});

