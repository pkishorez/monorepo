import { Schema } from 'effect';
export const stageOutputsView = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Json,
});
