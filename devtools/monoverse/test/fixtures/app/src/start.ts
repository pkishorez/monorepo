import { store } from './feature/services/store/real/index.ts';
import { Feature } from './feature/actor-feature/index.ts';
import { shape } from './feature/actor-feature/logic/index.ts';
import { detail } from './feature/actor-feature/logic/shape.ts'; // ✗ inside
export const app = [store, Feature, shape, detail];
