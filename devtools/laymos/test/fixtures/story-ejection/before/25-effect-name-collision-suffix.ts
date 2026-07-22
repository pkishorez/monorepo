import { step } from 'laymos/story';

const Effect = 'occupied';
const NativeEffect = 'also occupied';
export const result = step(
  'Deferred',
  { description: 'Defers execution.' },
  () => operation,
);
