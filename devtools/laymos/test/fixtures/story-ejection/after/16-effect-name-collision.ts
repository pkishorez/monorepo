import { Option, Effect as NativeEffect } from 'effect';


const Effect = 'occupied';
export const fallback = Option.none();
export const result = NativeEffect.suspend(() => operation);
