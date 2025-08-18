import { Effect } from 'effect';
import { table } from '../setup.js';

// Re-export the centralized table instances for backwards compatibility
export function createSimpleTable() {
  // Simple table is just the main table without indexes for basic operations
  // Since our setup table has all indexes, we can use it for simple operations too
  return table;
}

export function createIndexedTable() {
  // Return the centralized table instance that has all indexes configured
  return table;
}

// Constants
export const PREFIXES = {
  USER: 'user#',
  PRODUCT: 'product#',
  ORDER: 'order#',
  CATEGORY: 'category#',
  BRAND: 'brand#',
  DATE: 'date#',
  STATUS: 'status#',
  PRICE: 'price#',
  STORE: 'store#',
  CATALOG: 'catalog#',
  INVENTORY: 'inventory#',
  DEPARTMENT: 'department#',
  COMPANY: 'company#',
  TYPE: 'type#',
  MULTI: 'multi#',
} as const;

export const SORT_KEY_TYPES = {
  PROFILE: 'profile',
  SETTINGS: 'settings',
  METADATA: 'metadata#',
  DETAILS: 'details#',
  DATA: 'data#',
  ITEM: 'item#',
  EMPLOYEE: 'employee#',
  PROJECT: 'project#',
} as const;

export const STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
} as const;

// Type definitions
export interface UserItem {
  pkey: string;
  skey: string;
  name: string;
  email: string;
  status: string;
  [key: string]: any;
}

export interface ProductItem {
  pkey: string;
  skey: string;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
  lsi1skey?: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  [key: string]: any;
}

export interface OrderItem {
  pkey: string;
  skey: string;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
  lsi1skey?: string;
  orderId: string;
  userId: string;
  date: string;
  status: string;
  total: number;
  [key: string]: any;
}

// Factory functions
export function createUser(
  id: string,
  overrides: Partial<UserItem> = {},
): UserItem {
  return {
    pkey: `${PREFIXES.USER}${id}`,
    skey: SORT_KEY_TYPES.PROFILE,
    name: `User ${id}`,
    email: `user${id}@test.com`,
    status: STATUS.ACTIVE,
    ...overrides,
  };
}

export function createProduct(
  id: string,
  category: string,
  brand: string,
  overrides: { price?: number; stock?: number; [key: string]: any } = {},
): ProductItem {
  const price = overrides.price ?? 100;
  return {
    pkey: `${PREFIXES.PRODUCT}${id}`,
    skey: `${SORT_KEY_TYPES.METADATA}${id}`,
    gsi1pk: `${PREFIXES.CATEGORY}${category}`,
    gsi1sk: `${PREFIXES.BRAND}${brand}#${id}`,
    gsi2pk: `${PREFIXES.BRAND}${brand}`,
    gsi2sk: `${PREFIXES.PRICE}${price.toString().padStart(6, '0')}#${id}`,
    lsi1skey: `${PREFIXES.PRICE}${price}#${id}`,
    name: `Product ${id}`,
    category,
    brand,
    price,
    stock: overrides.stock ?? 50,
    ...overrides,
  };
}

export function createOrder(
  orderId: string,
  userId: string,
  date: string,
  overrides: { status?: string; total?: number; [key: string]: any } = {},
): OrderItem {
  const status = overrides.status ?? STATUS.PENDING;
  const total = overrides.total ?? 250;
  return {
    pkey: `${PREFIXES.ORDER}${orderId}`,
    skey: `${SORT_KEY_TYPES.DETAILS}${orderId}`,
    gsi1pk: `${PREFIXES.USER}${userId}`,
    gsi1sk: `${PREFIXES.DATE}${date}#${orderId}`,
    gsi2pk: `${PREFIXES.STATUS}${status}`,
    gsi2sk: `${PREFIXES.DATE}${date}#${orderId}`,
    lsi1skey: `${PREFIXES.STATUS}${status}#${orderId}`,
    orderId,
    userId,
    date,
    status,
    total,
    ...overrides,
  };
}

// Helper functions
export function createKey(pkey: string, skey: string = SORT_KEY_TYPES.PROFILE) {
  return {
    pkey,
    skey,
  };
}

export async function batchPutItems<T>(table: any, items: T[]): Promise<void> {
  for (const item of items) {
    await Effect.runPromise(table.putItem(item));
  }
}

// Assertion helpers
export function expectItemCount(items: any[], expectedCount: number): void {
  expect(items).toHaveLength(expectedCount);
}

export function expectAllItemsMatch<T>(
  items: T[],
  predicate: (item: T) => boolean,
  message?: string,
): void {
  const result = items.every(predicate);
  if (message) {
    expect(result).toBe(true);
  } else {
    expect(result).toBe(true);
  }
}

export function expectItemsInRange(
  items: any[],
  field: string,
  min: any,
  max: any,
): void {
  expectAllItemsMatch(
    items,
    (item) => item[field] >= min && item[field] <= max,
  );
}

// Test data generators
export function generateProducts(
  count: number,
  category: string = 'test',
): ProductItem[] {
  const products: ProductItem[] = [];
  for (let i = 1; i <= count; i++) {
    products.push(
      createProduct(
        i.toString().padStart(3, '0'),
        category,
        `brand${(i % 3) + 1}`,
        { price: i * 10 },
      ),
    );
  }
  return products;
}

export function generateOrders(
  count: number,
  userId: string = 'testuser',
): OrderItem[] {
  const orders: OrderItem[] = [];
  const statuses = Object.values(STATUS);
  for (let i = 1; i <= count; i++) {
    const date = `2024-01-${i.toString().padStart(2, '0')}`;
    orders.push(
      createOrder(i.toString().padStart(3, '0'), userId, date, {
        status: statuses[i % statuses.length],
        total: i * 100,
      }),
    );
  }
  return orders;
}

// Query builder helpers
export interface QueryResult<T = any> {
  Items: T[];
  LastEvaluatedKey?: Record<string, any>;
}

export async function queryWithPagination<T>(
  queryFn: (options: any) => Effect.Effect<QueryResult<T>>,
  baseParams: any,
  pageSize: number,
): Promise<T[]> {
  const allItems: T[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await Effect.runPromise(
      queryFn({
        ...baseParams,
        limit: pageSize,
        ...(lastKey && { exclusiveStartKey: lastKey }),
      }),
    );
    allItems.push(...result.Items);
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return allItems;
}

