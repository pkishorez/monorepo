import type { ESchema } from '@monorepo/eschema';
import { Schema } from 'effect';

export class DynamoCollection {
  static make<TSchema extends ESchema<any>>(eschema: TSchema) {
    const schema = eschema.extend(
      Schema.Struct({
        __m: Schema.Date,
      }),
    );
  }
}
