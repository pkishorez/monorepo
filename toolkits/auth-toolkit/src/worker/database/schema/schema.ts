import { defineRelations } from 'drizzle-orm';
// oxlint-disable-next-line monoverse/no-star -- drizzle needs every table of the schema better-auth regenerates, including ones a new plugin adds
import * as authSchema from './schema.generated.js';

export { authSchema };

export const authRelations = {
  ...defineRelations(authSchema),
  ...authSchema.authRelations,
};
