import { format } from '../../logic/shared/format/index.ts';
import { format as raw } from '../../logic/shared/format/fmt.ts'; // ✗ imports
import { B } from '../actor-b/index.ts'; // ✗ imports
import { S } from '../shared/actor-s/index.ts';
import { Store } from '../../../services/store/contract/index.ts';
import { Deep } from './children/actor-deep/index.ts';
export const A = [format, raw, B, S, Store, Deep];
export const later = () => import('../actor-b/index.ts'); // ✗ imports
