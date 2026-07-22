#!/usr/bin/env node
import { step } from 'laymos/story';

export const result = step(
  'Deferred',
  { description: 'Defers execution.' },
  () => operation,
);
