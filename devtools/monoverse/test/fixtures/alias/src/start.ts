import { part } from '@/feature/index.ts';
import { part as raw } from '@/feature/part.ts'; // ✗ inside
import { x } from '#lib/deep/index.ts';
import { x as rawX } from '#lib/deep/x.ts'; // ✗ inside
import { part as self } from 'fixture-alias/feature/part.ts'; // ✗ inside
import { n } from './nested/src/n.ts';
export const start = [part, raw, x, rawX, self, n];
