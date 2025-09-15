import type { DynamoTable } from '../src/table/index.js';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from './setup.js';

interface TestItem {
  userId: string;
  username: string;
  email: string;
  score: number;
  metadata: {
    created: string;
    updated: string;
    version: number;
  };
  settings?: {
    notifications: boolean;
    theme: 'light' | 'dark';
  };
}

// Create a typed table for testing
const typedTable = table as DynamoTable<
  { pk: 'pkey'; sk: 'skey' },
  {
    GSI1: { pk: 'gsi1pk'; sk: 'gsi1sk' };
    GSI2: { pk: 'gsi2pk'; sk: 'gsi2sk' };
    LSI1: { pk: 'pkey'; sk: 'lsi1skey' };
  },
  TestItem
>;

describe('expression Builders', () => {
  beforeEach(async () => {
    await cleanTable();
  });

  describe('update Expressions', () => {
    beforeEach(async () => {
      // Setup base item for update tests
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'user#test', skey: 'profile' },
          {
            userId: 'test',
            username: 'testuser',
            email: 'test@example.com',
            score: 100,
            metadata: {
              created: '2024-01-01',
              updated: '2024-01-01',
              version: 1,
            },
          },
        ),
      );
    });

    describe('sET expressions', () => {
      it('should set single attribute', async () => {
        await Effect.runPromise(
          typedTable.updateItem(
            { pkey: 'user#test', skey: 'profile' },
            {
              update: { username: 'newusername' },
            },
          ),
        );

        const result = await Effect.runPromise(
          typedTable.getItem({ pkey: 'user#test', skey: 'profile' }),
        );

        expect(result.Item?.username).toBe('newusername');
      });

      it('should set multiple attributes', async () => {
        await Effect.runPromise(
          typedTable.updateItem(
            { pkey: 'user#test', skey: 'profile' },
            {
              update: {
                username: 'updateduser',
                email: 'updated@example.com',
                score: 200,
              },
            },
          ),
        );

        const result = await Effect.runPromise(
          typedTable.getItem({ pkey: 'user#test', skey: 'profile' }),
        );

        expect(result.Item?.username).toBe('updateduser');
        expect(result.Item?.email).toBe('updated@example.com');
        expect(result.Item?.score).toBe(200);
      });

      it('should set nested attributes', async () => {
        await Effect.runPromise(
          typedTable.updateItem(
            { pkey: 'user#test', skey: 'profile' },
            {
              update: {
                metadata: {
                  created: '2024-01-01',
                  updated: '2024-12-01',
                  version: 2,
                },
              },
            },
          ),
        );

        const result = await Effect.runPromise(
          typedTable.getItem({ pkey: 'user#test', skey: 'profile' }),
        );

        expect(result.Item?.metadata.updated).toBe('2024-12-01');
        expect(result.Item?.metadata.version).toBe(2);
        expect(result.Item?.metadata.created).toBe('2024-01-01');
      });

      it('should create new nested attributes', async () => {
        await Effect.runPromise(
          typedTable.updateItem(
            { pkey: 'user#test', skey: 'profile' },
            {
              update: {
                settings: {
                  notifications: true,
                  theme: 'dark' as const,
                },
              },
            },
          ),
        );

        const result = await Effect.runPromise(
          typedTable.getItem({ pkey: 'user#test', skey: 'profile' }),
        );

        expect(result.Item?.settings).toEqual({
          notifications: true,
          theme: 'dark',
        });
      });
    });
  });

  describe('projection Expressions', () => {
    beforeEach(async () => {
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'proj#test', skey: 'item' },
          {
            userId: 'proj',
            username: 'projuser',
            email: 'proj@example.com',
            score: 100,
            metadata: {
              created: '2024-01-01',
              updated: '2024-01-01',
              version: 1,
            },
            settings: {
              notifications: true,
              theme: 'dark' as const,
            },
          },
        ),
      );
    });

    it('should project specific attributes', async () => {
      const result = await Effect.runPromise(
        typedTable.getItem(
          { pkey: 'proj#test', skey: 'item' },
          { projection: ['username', 'email'] },
        ),
      );

      expect(result.Item).toEqual({
        username: 'projuser',
        email: 'proj@example.com',
      });
    });

    it('should project nested attributes', async () => {
      const result = await Effect.runPromise(
        typedTable.getItem(
          { pkey: 'proj#test', skey: 'item' },
          { projection: ['username', 'metadata', 'settings'] },
        ),
      );

      expect(result.Item?.username).toBe('projuser');
      expect(result.Item?.metadata).toBeDefined();
      expect(result.Item?.settings).toBeDefined();
    });

    it('should work with query projections', async () => {
      const result = await Effect.runPromise(
        typedTable.query(
          { pk: 'proj#test' },
          { projection: ['userId', 'score'] },
        ),
      );

      expect(result.Items).toHaveLength(1);
      expect(result.Items[0]).toEqual({
        userId: 'proj',
        score: 100,
      });
    });

    it('should work with scan projections', async () => {
      const result = await Effect.runPromise(
        typedTable.scan({
          projection: ['username', 'pkey'],
        }),
      );

      const projItem = result.Items.find((item) => item.pkey === 'proj#test');
      expect(projItem).toBeDefined();
      expect(projItem?.username).toBe('projuser');
    });
  });
});

