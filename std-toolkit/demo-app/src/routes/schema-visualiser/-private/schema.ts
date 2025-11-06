import { Schema } from 'effect';

// Branded ID types
export const WarehouseId = Schema.String.pipe(Schema.brand('WarehouseId'));
export type WarehouseId = typeof WarehouseId.Type;

export const SupplierId = Schema.String.pipe(Schema.brand('SupplierId'));
export type SupplierId = typeof SupplierId.Type;

export const ProductId = Schema.String.pipe(Schema.brand('ProductId'));
export type ProductId = typeof ProductId.Type;

// Warehouses Schema
export const Warehouses = Schema.Struct({
  id: WarehouseId.pipe(
    Schema.annotations({ description: 'Unique warehouse identifier' }),
  ),
  name: Schema.String.pipe(
    Schema.annotations({ description: 'Warehouse name' }),
  ),
  address: Schema.String.pipe(
    Schema.annotations({ description: 'Warehouse address' }),
  ),
  capacity: Schema.Number.pipe(
    Schema.int(),
    Schema.annotations({ description: 'Storage capacity' }),
  ),
});

// Suppliers Schema
export const Suppliers = Schema.Struct({
  id: SupplierId.pipe(
    Schema.annotations({ description: 'Unique supplier identifier' }),
  ),
  name: Schema.String.pipe(
    Schema.annotations({ description: 'Supplier name' }),
  ),
  description: Schema.String.pipe(
    Schema.annotations({ description: 'Supplier description' }),
  ),
  country: Schema.String.pipe(
    Schema.annotations({ description: 'Country of origin' }),
  ),
});

// Products Schema
export const Products = Schema.Struct({
  id: ProductId.pipe(
    Schema.annotations({ description: 'Unique product identifier' }),
  ),
  name: Schema.String.pipe(
    Schema.annotations({ description: 'Product name' }),
  ),
  description: Schema.String.pipe(
    Schema.annotations({ description: 'Product description' }),
  ),
  warehouse_id: WarehouseId.pipe(
    Schema.annotations({ description: 'Associated warehouse' }),
  ),
  supplier_id: SupplierId.pipe(
    Schema.annotations({ description: 'Associated supplier' }),
  ),
  price: Schema.Number.pipe(
    Schema.annotations({ description: 'Product price' }),
  ),
  quantity: Schema.Number.pipe(
    Schema.int(),
    Schema.annotations({ description: 'Available quantity' }),
  ),
});

// Export all schemas for easy iteration
export const allSchemas = {
  Products,
  Warehouses,
  Suppliers,
} as const;
