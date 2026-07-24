import { Effect, Schema } from 'effect';
import { ESchema, EntityESchema, type AnyESchema } from './index.js';

// ─── ESchema (named plain schema, not an entity) ────────────────────────────

const AppConfig = ESchema.make('AppConfig', {
  theme: Schema.String,
  maxRetries: Schema.Number,
}).build();

// ─── EntityESchema (named + ID field) ────────────────────────────────────────

const User = EntityESchema.make('User', 'id', {
  name: Schema.String,
  email: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (prev) => ({ ...prev, age: 0 }))
  .build();

// ─── Type hierarchy: EntityESchema assignable to AnyESchema ──────────────────

function processSchema(schema: AnyESchema) {
  return schema.getDescriptor();
}

// Both object schema variants are assignable to AnyESchema
processSchema(AppConfig);
processSchema(User);

// EntityESchema → AnyESchema works
const _widened: AnyESchema = User;

// ESchema → AnyESchema works
const _widened2: AnyESchema = AppConfig;

// AnyESchema → EntityESchema does NOT work (uncomment to see type error):
// const _narrowed: EntityESchema<any, any, any, any> = AppConfig;

async function main() {
  console.log('=== ESchema ===');
  const config = await Effect.runPromise(
    AppConfig.encode({ theme: 'dark', maxRetries: 3 }),
  );
  console.log('config:', config);

  console.log('\n=== EntityESchema ===');
  console.log('name:', User.name, '| idField:', User.idField);
  const user = await Effect.runPromise(
    User.decode({ _v: 'v1', id: 'u1', name: 'Alice', email: 'a@b.com' }),
  );
  console.log('user (migrated v1→v2):', user);
}

main().catch(console.error);
