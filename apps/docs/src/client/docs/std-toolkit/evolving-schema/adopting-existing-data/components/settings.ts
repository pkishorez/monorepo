import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

// Step 1: the shape your rows already have, as v1. Nothing else changes.
export const SettingsAdopted = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

// Step 2, a later release: now a version can be added.
export const Settings = ESchema.make('Settings', {
  theme: Schema.String,
})
  .evolve('v2', { fontSize: Schema.Finite }, (v1) => ({ ...v1, fontSize: 14 }))
  .build();
