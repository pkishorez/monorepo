import { shape } from './logic/index.ts';
import { detail } from './logic/shape.ts'; // ✗ inside
import { A } from './children/actor-a/index.ts';
import { Deep } from './children/actor-a/children/actor-deep/index.ts';
import { Store } from '../services/store/contract/index.ts';
import { body } from './view/index.ts';
export const Feature = [shape, detail, A, Deep, Store, body];
