import { Schema } from 'effect';
import { StdTable } from 'std-toolkit/db';
import { ESchema, EntityESchema } from 'std-toolkit/eschema';

const ref = (entity: string) =>
  Schema.String.annotate({ entityReference: entity });

export const commerceTable = StdTable.make('commerce-platform')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const CommerceSettingsSchema = ESchema.make('CommerceSettings', {
  currency: Schema.String,
  taxInclusive: Schema.Boolean,
  defaultPageSize: Schema.Number,
}).build();

export const commerceSettingsEntity = commerceTable
  .singleEntity(CommerceSettingsSchema)
  .default({ currency: 'USD', taxInclusive: false, defaultPageSize: 20 });

export const CustomerSchema = EntityESchema.make('Customer', 'id', {
  name: Schema.String,
  email: Schema.String,
  defaultAddressId: Schema.NullOr(ref('Address')),
}).build();

export const customerEntity = commerceTable
  .entity(CustomerSchema)
  .primary({ pk: [] })
  .build();

export const AddressSchema = EntityESchema.make('Address', 'id', {
  customerId: ref('Customer'),
  line1: Schema.String,
  city: Schema.String,
  country: Schema.String,
}).build();

export const addressEntity = commerceTable
  .entity(AddressSchema)
  .primary({ pk: [] })
  .index('GSI1', 'byCustomer', { pk: ['customerId'] })
  .build();

export const OrderSchema = EntityESchema.make('Order', 'id', {
  customerId: ref('Customer'),
  shippingAddressId: ref('Address'),
  status: Schema.String,
  total: Schema.Number,
  audit: Schema.Struct({
    actorId: ref('Identity'),
    requestId: Schema.String,
  }),
}).build();

export const orderEntity = commerceTable
  .entity(OrderSchema)
  .primary({ pk: [] })
  .index('GSI1', 'byCustomer', { pk: ['customerId'] })
  .build();

export const commerceSnapshot = commerceTable.snapshot();
