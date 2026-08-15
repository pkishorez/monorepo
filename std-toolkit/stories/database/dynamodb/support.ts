import { Schema } from 'effect';
import { unmarshall } from 'std-toolkit/db/dynamodb';
import { EntityESchema } from 'std-toolkit/eschema';

import { table } from '../support.js';

export const CounterSchema = EntityESchema.make('Counter', 'counterId', {
  views: Schema.Number,
  tags: Schema.Array(Schema.String),
  label: Schema.String,
}).build();

export const counter = table.entity(CounterSchema).primary({ pk: [] }).build();

export const unmarshallItem = (item: object | undefined) =>
  unmarshall((item ?? {}) as Parameters<typeof unmarshall>[0]);

export const counterKey = (counterId: string) => ({
  pk: 'Counter',
  sk: counterId,
});
