import { defineRelations } from 'drizzle-orm';
import * as authSchema from './schema.generated.js';

export { authSchema };

export const authRelations = {
  ...defineRelations(authSchema),
  ...authSchema.authRelations,
};
