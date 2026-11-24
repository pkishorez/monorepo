import { FeatureRpc } from '../contract/index.ts';
import { Db } from '../../../services/db/contract/index.ts';
import { other } from '../../other/real/index.ts'; // ✗ imports
export const handlers = [FeatureRpc, Db, other];
